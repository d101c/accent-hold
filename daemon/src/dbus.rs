use anyhow::Result;
use std::time::Duration;
use zbus::{blocking::Connection, proxy};

#[proxy(
    interface = "dev.accenthold.Popup",
    default_service = "dev.accenthold.Popup",
    default_path = "/dev/accenthold/Popup"
)]
trait Popup {
    /// Demande l'ouverture de la popup pour `letter`.
    /// Retourne true si l'extension a pris la main.
    fn trigger(&self, letter: &str) -> zbus::Result<bool>;
}

pub struct PopupClient {
    conn: Connection,
}

impl PopupClient {
    pub fn new() -> Result<Self> {
        Ok(Self { conn: Connection::session()? })
    }

    /// Renvoie true si la popup a été déclenchée, false sinon
    /// (extension absente / erreur / pas de réponse) → repli EmitTap.
    /// L'appel D-Bus tourne sur un thread et est borné à 500 ms : on ne gèle
    /// jamais le clavier si l'extension détient le nom mais ne répond pas.
    pub fn trigger(&self, letter: char) -> bool {
        let s = letter.to_string();
        let conn = self.conn.clone();
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            let res = PopupProxyBlocking::new(&conn)
                .and_then(|p| p.trigger(&s))
                .unwrap_or(false);
            let _ = tx.send(res);
        });
        rx.recv_timeout(Duration::from_millis(500)).unwrap_or(false)
    }
}
