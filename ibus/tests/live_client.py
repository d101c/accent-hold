"""Client side of live_ibus.sh: drives the engine through a real InputContext."""

import sys

import gi
gi.require_version('IBus', '1.0')
from gi.repository import GLib, IBus  # noqa: E402

RELEASE = int(IBus.ModifierType.RELEASE_MASK)
KC_E, KC_2, KC_X = 18, 3, 45
events = []


def wait(ms):
    loop = GLib.MainLoop()
    GLib.timeout_add(ms, lambda: loop.quit() or False)
    loop.run()


def key(ctx, keyval, keycode, state=0):
    handled = ctx.process_key_event(keyval, keycode, state)
    events.append(('key', IBus.keyval_name(keyval), bool(state & RELEASE), handled))
    return handled


def check(name, condition):
    print(('PASS ' if condition else 'FAIL ') + name)
    return condition


def main():
    IBus.init()
    bus = IBus.Bus()
    if not bus.is_connected():
        print('FAIL cannot connect to the private ibus-daemon')
        return 1
    names = [e.get_name() for e in bus.list_engines()]
    ok = check('engine registered', 'accent-hold:us' in names)

    # Start the engine the way `ibus engine NAME` does, before creating the
    # context, so the factory is up when the context asks for it.
    bus.set_global_engine('accent-hold:us')
    wait(1500)
    ctx = bus.create_input_context('accent-hold-test')
    ctx.set_capabilities(int(IBus.Capabilite.FOCUS | IBus.Capabilite.LOOKUP_TABLE))
    ctx.connect('commit-text', lambda _c, t: events.append(('commit', t.get_text())))
    ctx.connect('forward-key-event',
                lambda _c, kv, kc, st: events.append(('forward', IBus.keyval_name(kv), kc, bool(st & RELEASE))))
    ctx.connect('update-lookup-table',
                lambda _c, t, vis: events.append(
                    ('table', [t.get_candidate(i).get_text() for i in range(t.get_number_of_candidates())], vis)))
    ctx.connect('hide-lookup-table', lambda _c: events.append(('hide',)))
    ctx.focus_in()
    ctx.set_engine('accent-hold:us')
    wait(300)
    ok &= check('engine active', ctx.get_engine() and ctx.get_engine().get_name() == 'accent-hold:us')

    # Quick tap: forwarded to the application, nothing else.
    ok &= check('tap forwarded', not key(ctx, IBus.KEY_e, KC_E))
    key(ctx, IBus.KEY_e, KC_E, RELEASE)
    wait(600)
    ok &= check('tap opens nothing', not any(e[0] == 'table' for e in events))

    # Hold: candidate list opens.
    events.clear()
    key(ctx, IBus.KEY_e, KC_E)
    wait(600)
    tables = [e for e in events if e[0] == 'table']
    ok &= check('hold shows candidates', bool(tables) and tables[-1][1][:2] == ['é', 'è'])
    key(ctx, IBus.KEY_e, KC_E, RELEASE)

    # Digit row by keycode (here the "2" key) picks the second candidate.
    events.clear()
    ok &= check('digit consumed', key(ctx, IBus.KEY_2, KC_2))
    key(ctx, IBus.KEY_2, KC_2, RELEASE)
    wait(400)
    ok &= check('letter deleted with BackSpace', ('forward', 'BackSpace', 14, False) in events)
    ok &= check('accent committed', ('commit', 'è') in events)

    # Escape keeps the plain letter.
    events.clear()
    key(ctx, IBus.KEY_e, KC_E)
    wait(600)
    ok &= check('escape consumed', key(ctx, IBus.KEY_Escape, 1))
    wait(200)
    ok &= check('escape commits nothing', not any(e[0] == 'commit' for e in events))
    key(ctx, IBus.KEY_e, KC_E, RELEASE)

    # Ordinary key: passed straight to the application, no engine-side repeat
    # (the keymap's own repeat handles it).
    events.clear()
    ok &= check('ordinary key forwarded', not key(ctx, IBus.KEY_x, KC_X))
    wait(900)
    key(ctx, IBus.KEY_x, KC_X, RELEASE)
    ok &= check('no engine-side repeat', not any(e[0] == 'forward' for e in events))

    if not ok:
        for e in events:
            print('  ', e)
    return 0 if ok else 1


if __name__ == '__main__':
    sys.exit(main())
