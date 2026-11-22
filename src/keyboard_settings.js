'use strict';

class OpenMHKeyboardSettings {
	static actions = [
		['left', 'Steer left'],
		['right', 'Steer right'],
		['accelerate', 'Accelerate'],
		['brake', 'Brake / reverse'],
		['handbrake', 'Handbrake'],
		['horn', 'Horn'],
		['shiftUp', 'Shift up (manual)'],
		['shiftDown', 'Shift down (manual)'],
		['rearView', 'Look back (hold)'],
		['info', 'Standings (hold)'],
		['inCar', 'In-car camera'],
		['chase', 'Chase camera'],
		['trackCamera', 'Track camera'],
		['cycleCar', 'Cycle viewed car']
	];
	static keyGroups = {
		'Arrows and modifiers': [
			'LeftArrow',
			'RightArrow',
			'UpArrow',
			'DownArrow',
			'Space',
			'Shift',
			'RightShift',
			'Ctrl',
			'RightControl',
			'Alt',
			'RightAlt'
		],
		Letters: [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'],
		Numbers: [...'0123456789'],
		'Function keys': Array.from(
			{length: 12}, (_, i) => 'F' + (i + 1)),
		'Other keys':
			[
				'Tab',
				'Return',
				'Back',
				'Insert',
				'Delete',
				'Home',
				'End',
				'PageUp',
				'PageDown',
				'Minus',
				'Equals',
				'LeftBracket',
				'RightBracket',
				'SemiColon',
				'Apostrophe',
				'AccentGrave',
				'BackSlash',
				'Comma',
				'Period',
				'Slash',
				'CapsLock'
			],
		'Number pad':
			[
				...Array.from(
					{length: 10}, (_, i) => 'Num' + i),
				'NumAdd',
				'NumSubtract',
				'NumMultiply',
				'NumDivide',
				'NumDecimal',
				'NumEnter'
			]
	};
	static labels = {
		LeftArrow: '← Left arrow',
		RightArrow: '→ Right arrow',
		UpArrow: '↑ Up arrow',
		DownArrow: '↓ Down arrow',
		Shift: 'Left Shift',
		Ctrl: 'Left Ctrl',
		Alt: 'Left Alt',
		RightControl: 'Right Ctrl',
		RightShift: 'Right Shift',
		RightAlt: 'Right Alt',
		Return: 'Enter',
		Back: 'Backspace'
	};

	constructor(player, profile, container) {
		this.player = player;
		this.profile = profile;
		this.inputs = new Map();
		const keys = player.getControlBindings(profile);
		container.replaceChildren();
		for (const [action, title] of OpenMHKeyboardSettings.actions) {
			const label = document.createElement('label');
			label.textContent = title;
			const select = this.keySelect(keys[action]);
			this.inputs.set(action, select);
			label.append(select);
			container.append(label);
		}
	}

	keySelect(selected) {
		const select = document.createElement('select');
		const reserved = Object.values(OpenMHRaceView.shortcuts);
		for (const [title, keys] of Object.entries(
			     OpenMHKeyboardSettings.keyGroups)) {
			const group = document.createElement('optgroup');
			group.label = title;
			for (const key of keys) {
				if (reserved.includes(key))
					continue;
				group.append(new Option(
					OpenMHKeyboardSettings.labels[key] ||
						key,
					key,
					false,
					key === selected));
			}
			select.append(group);
		}
		// Retain unusual imported bindings until the player chooses a replacement.
		if (![...select.options].some(
			    (option) => option.value === selected)) {
			const current = new Option(selected || 'Unbound',
				selected || '',
				true,
				true);
			current.disabled = true;
			select.prepend(current);
		}
		return select;
	}

	apply() {
		const current = this.player.getControlBindings(this.profile);
		for (const [action, select] of this.inputs)
			if (select.value !== (current[action] || ''))
				this.player.setControlBinding(
					this.profile, action, select.value);
	}
}
