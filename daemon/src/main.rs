mod statemachine;
mod table;
mod dbus;

use anyhow::{Context, Result};
use evdev::{Device, EventType, InputEvent, Key, uinput::VirtualDeviceBuilder, AttributeSet};
use statemachine::{StateMachine, Input, Action};
use std::os::unix::io::{AsRawFd, BorrowedFd};
use std::time::Instant;

use nix::fcntl::{fcntl, FcntlArg, OFlag};
use nix::poll::{poll, PollFd, PollFlags};

const ACCENTS_PATH: &str = "/usr/local/share/accent-hold/accents.json";

/// Mappe un evdev Key vers le char de base s'il est accentuable et sans modifieur.
/// (MVP : layout-agnostic simplifié — on mappe les Key alphabétiques en minuscule.)
fn key_to_letter(key: Key) -> Option<char> {
    use evdev::Key as K;
    let c = match key {
        K::KEY_A => 'a', K::KEY_C => 'c', K::KEY_E => 'e', K::KEY_I => 'i',
        K::KEY_N => 'n', K::KEY_O => 'o', K::KEY_U => 'u', K::KEY_Y => 'y',
        K::KEY_S => 's', K::KEY_Z => 'z', K::KEY_G => 'g',
        _ => return None,
    };
    Some(c)
}

fn letter_to_key(c: char) -> Option<Key> {
    use evdev::Key as K;
    Some(match c {
        'a' => K::KEY_A, 'c' => K::KEY_C, 'e' => K::KEY_E, 'i' => K::KEY_I,
        'n' => K::KEY_N, 'o' => K::KEY_O, 'u' => K::KEY_U, 'y' => K::KEY_Y,
        's' => K::KEY_S, 'z' => K::KEY_Z, 'g' => K::KEY_G,
        _ => return None,
    })
}

fn now_ms(start: Instant) -> u64 { start.elapsed().as_millis() as u64 }

fn main() -> Result<()> {
    let accentable = table::load_accentable(ACCENTS_PATH)
        .context("loading accents.json")?;
    let popup = dbus::PopupClient::new().context("connecting session bus")?;

    // Sélectionne le premier clavier physique (MVP : un clavier).
    let mut device = pick_keyboard().context("no keyboard found")?;

    // Périphérique virtuel de ré-émission.
    let mut keys = AttributeSet::<Key>::new();
    for k in Key::KEY_RESERVED.code()..0x2ffu16 {
        keys.insert(Key::new(k));
    }
    let mut vdev = VirtualDeviceBuilder::new()?
        .name("accent-hold-virtual")
        .with_keys(&keys)?
        .build()?;

    device.grab().context("EVIOCGRAB failed")?;

    // fd non-bloquant pour pouvoir générer des Tick réguliers via poll().
    let raw_fd = device.as_raw_fd();
    let cur = fcntl(raw_fd, FcntlArg::F_GETFL).context("F_GETFL")?;
    fcntl(
        raw_fd,
        FcntlArg::F_SETFL(OFlag::from_bits_truncate(cur) | OFlag::O_NONBLOCK),
    )
    .context("F_SETFL O_NONBLOCK")?;

    let start = Instant::now();
    let mut sm = StateMachine::new(read_hold_ms());

    loop {
        // Attend des événements jusqu'à ~30 ms, puis génère un Tick.
        let borrowed = unsafe { BorrowedFd::borrow_raw(raw_fd) };
        let mut fds = [PollFd::new(&borrowed, PollFlags::POLLIN)];
        let _ = poll(&mut fds, 30);

        // Pompage de tous les événements disponibles (fd non-bloquant).
        loop {
            match device.fetch_events() {
                Ok(events) => {
                    let batch: Vec<InputEvent> = events.collect();
                    if batch.is_empty() {
                        break;
                    }
                    for ev in batch {
                        if ev.event_type() != EventType::KEY {
                            emit_raw(&mut vdev, ev)?;
                            continue;
                        }
                        let key = Key::new(ev.code());
                        let t = now_ms(start);

                        match key_to_letter(key) {
                            Some(letter) if accentable.contains(&letter) => {
                                let input = match ev.value() {
                                    1 => Input::AccentKeyDown { letter, t_ms: t },
                                    0 => Input::AccentKeyUp { t_ms: t },
                                    // repeat (value==2) : avalé pour la lettre tenue
                                    _ => continue,
                                };
                                for action in sm.handle(input) {
                                    run_action(&mut vdev, &popup, &mut sm, action)?;
                                }
                            }
                            // Touche non-accentuable : ré-émission VERBATIM
                            // (préserve value 0/1/2 → l'auto-répétition reste intacte).
                            _ => emit_raw(&mut vdev, ev)?,
                        }
                    }
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => break,
                Err(e) => return Err(e).context("fetch_events"),
            }
        }

        // Tick régulier pour détecter l'expiration du seuil de maintien.
        let t = now_ms(start);
        for action in sm.handle(Input::Tick { t_ms: t }) {
            run_action(&mut vdev, &popup, &mut sm, action)?;
        }
    }
}

fn run_action(vdev: &mut evdev::uinput::VirtualDevice,
              popup: &dbus::PopupClient,
              sm: &mut StateMachine,
              action: Action) -> Result<()> {
    match action {
        Action::EmitTap(c) => {
            if let Some(k) = letter_to_key(c) { tap_key(vdev, k)?; }
        }
        Action::OpenPopup(c) => {
            if !popup.trigger(c) {
                for a in sm.on_popup_failed() { run_action(vdev, popup, sm, a)?; }
            }
        }
    }
    Ok(())
}

fn tap_key(vdev: &mut evdev::uinput::VirtualDevice, k: Key) -> Result<()> {
    vdev.emit(&[InputEvent::new(EventType::KEY, k.code(), 1)])?;
    vdev.emit(&[InputEvent::new(EventType::KEY, k.code(), 0)])?;
    Ok(())
}

fn emit_raw(vdev: &mut evdev::uinput::VirtualDevice, ev: InputEvent) -> Result<()> {
    vdev.emit(&[ev])?; Ok(())
}

fn read_hold_ms() -> u64 {
    std::env::var("ACCENT_HOLD_MS").ok()
        .and_then(|s| s.parse().ok()).unwrap_or(450)
}

fn pick_keyboard() -> Option<Device> {
    for (_p, dev) in evdev::enumerate() {
        if dev.supported_keys().map_or(false, |k| k.contains(Key::KEY_A)) {
            return Some(dev);
        }
    }
    None
}
