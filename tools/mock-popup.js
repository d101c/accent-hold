#!/usr/bin/env gjs
// Service D-Bus FACTICE qui imite la popup de l'extension (dev.accenthold.Popup).
// Sert à vérifier, hors session graphique, que le daemon appelle bien Trigger.
const {Gio, GLib} = imports.gi;

const IFACE = `
<node>
  <interface name="dev.accenthold.Popup">
    <method name="Trigger">
      <arg type="s" direction="in" name="letter"/>
      <arg type="b" direction="out" name="handled"/>
    </method>
  </interface>
</node>`;

const impl = {
    Trigger(letter) {
        print(`MOCK: Trigger('${letter}') reçu -> renvoie handled=true`);
        return true;
    },
};

const loop = GLib.MainLoop.new(null, false);
Gio.bus_own_name(
    Gio.BusType.SESSION,
    'dev.accenthold.Popup',
    Gio.BusNameOwnerFlags.NONE,
    (conn) => {
        const exported = Gio.DBusExportedObject.wrapJSObject(IFACE, impl);
        exported.export(conn, '/dev/accenthold/Popup');
        print('MOCK: service dev.accenthold.Popup prêt');
    },
    null, null);

// auto-quit après 8 s pour ne jamais rester bloqué
GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 8, () => { loop.quit(); return false; });
loop.run();
