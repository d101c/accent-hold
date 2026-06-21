//! Machine tap/hold pure. Pas d'I/O, pas d'horloge réelle : on lui passe le temps.

/// Événement d'entrée logique (issu d'evdev, normalisé).
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Input {
    /// Appui d'une lettre accentuable (caractère de base).
    AccentKeyDown { letter: char, t_ms: u64 },
    /// Relâche de cette même lettre.
    AccentKeyUp { t_ms: u64 },
    /// Tick d'horloge (appelé régulièrement par la boucle).
    Tick { t_ms: u64 },
}

/// Action que la boucle d'I/O doit exécuter.
#[derive(Debug, Clone, PartialEq)]
pub enum Action {
    /// Ré-émettre un tap complet de la lettre (down+up) via uinput.
    EmitTap(char),
    /// Ouvrir la popup pour cette lettre (appel D-Bus).
    OpenPopup(char),
}

pub struct StateMachine {
    hold_ms: u64,
    pending: Option<(char, u64)>, // lettre avalée + t_ms du down
    popup_open: bool,
}

impl StateMachine {
    pub fn new(hold_ms: u64) -> Self {
        Self { hold_ms, pending: None, popup_open: false }
    }

    pub fn handle(&mut self, input: Input) -> Vec<Action> {
        match input {
            Input::AccentKeyDown { letter, t_ms } => {
                // Si une popup est déjà ouverte, l'extension détient le grab
                // clavier et consommera la touche : on ignore sans écraser l'état
                // courant (sinon la 2e lettre corrompt `pending`/`popup_open`).
                if self.popup_open {
                    return vec![];
                }
                // Avale la lettre, arme le timer. Rien n'est émis tout de suite.
                self.pending = Some((letter, t_ms));
                vec![]
            }
            Input::AccentKeyUp { .. } => {
                if self.popup_open {
                    // relâche pendant popup : on ignore (popup gère)
                    self.popup_open = false;
                    self.pending = None;
                    vec![]
                } else if let Some((letter, _)) = self.pending.take() {
                    // relâché avant le seuil => tap normal
                    vec![Action::EmitTap(letter)]
                } else {
                    vec![]
                }
            }
            Input::Tick { t_ms } => {
                if let Some((letter, down_t)) = self.pending {
                    if !self.popup_open && t_ms.saturating_sub(down_t) >= self.hold_ms {
                        self.popup_open = true;
                        return vec![Action::OpenPopup(letter)];
                    }
                }
                vec![]
            }
        }
    }

    /// Appelé par la boucle quand l'appel D-Bus a échoué (extension absente) :
    /// on émet la lettre de base en repli.
    pub fn on_popup_failed(&mut self) -> Vec<Action> {
        self.popup_open = false;
        if let Some((letter, _)) = self.pending.take() {
            vec![Action::EmitTap(letter)]
        } else {
            vec![]
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tap_before_threshold_emits_letter() {
        let mut sm = StateMachine::new(450);
        assert_eq!(sm.handle(Input::AccentKeyDown { letter: 'e', t_ms: 0 }), vec![]);
        assert_eq!(sm.handle(Input::Tick { t_ms: 100 }), vec![]);
        assert_eq!(sm.handle(Input::AccentKeyUp { t_ms: 200 }),
                   vec![Action::EmitTap('e')]);
    }

    #[test]
    fn hold_past_threshold_opens_popup_and_swallows_letter() {
        let mut sm = StateMachine::new(450);
        sm.handle(Input::AccentKeyDown { letter: 'e', t_ms: 0 });
        assert_eq!(sm.handle(Input::Tick { t_ms: 449 }), vec![]);
        assert_eq!(sm.handle(Input::Tick { t_ms: 450 }), vec![Action::OpenPopup('e')]);
        // relâche après ouverture : pas de tap émis
        assert_eq!(sm.handle(Input::AccentKeyUp { t_ms: 600 }), vec![]);
    }

    #[test]
    fn popup_failure_emits_base_letter() {
        let mut sm = StateMachine::new(450);
        sm.handle(Input::AccentKeyDown { letter: 'c', t_ms: 0 });
        sm.handle(Input::Tick { t_ms: 500 }); // popup open
        assert_eq!(sm.on_popup_failed(), vec![Action::EmitTap('c')]);
    }

    #[test]
    fn tick_only_fires_popup_once() {
        let mut sm = StateMachine::new(450);
        sm.handle(Input::AccentKeyDown { letter: 'a', t_ms: 0 });
        assert_eq!(sm.handle(Input::Tick { t_ms: 500 }), vec![Action::OpenPopup('a')]);
        assert_eq!(sm.handle(Input::Tick { t_ms: 600 }), vec![]); // plus rien
    }

    #[test]
    fn second_accent_key_ignored_while_popup_open() {
        let mut sm = StateMachine::new(450);
        sm.handle(Input::AccentKeyDown { letter: 'e', t_ms: 0 });
        assert_eq!(sm.handle(Input::Tick { t_ms: 500 }), vec![Action::OpenPopup('e')]);
        // 2e lettre pendant popup ouverte : ignorée, n'écrase pas pending
        assert_eq!(sm.handle(Input::AccentKeyDown { letter: 'a', t_ms: 600 }), vec![]);
        // un Tick ne doit pas ouvrir de popup pour 'a'
        assert_eq!(sm.handle(Input::Tick { t_ms: 700 }), vec![]);
        // relâche de la lettre d'origine : nettoie l'état, pas de tap parasite
        assert_eq!(sm.handle(Input::AccentKeyUp { t_ms: 800 }), vec![]);
    }
}
