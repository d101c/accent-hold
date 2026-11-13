import Clutter from 'gi://Clutter';
import St from 'gi://St';

// Fill a candidate button. Beside: "1 é" on one line (the default, as it has
// always been). Below: the character, with its number in a smaller row under
// it, so the numbers line up under the characters.
export function fillChip(chip, below, number, text) {
    if (!below) {
        chip.label = `${number} ${text}`;
        return;
    }
    chip.add_style_class_name('accent-chip-below');
    const box = new St.BoxLayout({x_align: Clutter.ActorAlign.CENTER});
    // `vertical` was replaced by `orientation` in recent GNOME Shell versions.
    if (box.orientation !== undefined)
        box.orientation = Clutter.Orientation.VERTICAL;
    else
        box.vertical = true;
    box.add_child(new St.Label({text, style_class: 'accent-chip-char', x_align: Clutter.ActorAlign.CENTER}));
    box.add_child(new St.Label({text: String(number), style_class: 'accent-chip-number', x_align: Clutter.ActorAlign.CENTER}));
    chip.set_child(box);
}
