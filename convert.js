const uuidBytes = new Uint8Array(16);
const uuid = new DataView(uuidBytes.buffer);

const uuidViews = {
	hex: {
		inputs: [
			document.getElementById('hex')
		],
		constants: {
			groupSizes: [8, 4, 4, 4, 12],
		},
		parse: ([hex], {groupSizes}) => {
			if (!hex.validity.valid) return;
			const hexText =  hex.value.includes('-')
				? hex.value.trim()
					.split('-')
					.map((g, i) => g.padStart(groupSizes[i], '0'))
					.join('')
				: hex.value.trim().padStart(32, '0');
			uuid.setBigUint64(0, BigInt('0x' + hexText.substring(0, 16)), false);
			uuid.setBigUint64(8, BigInt('0x' + hexText.substring(16)), false);
		},
		unparse: ([hex], {groupSizes}) => {
			const hexText =
				uuid.getBigUint64(0, false).toString(16).padStart(16, '0') +
				uuid.getBigUint64(8, false).toString(16).padStart(16, '0');
			const groups = [];
			let groupStart = 0;
			for (const groupSize of groupSizes) {
				groups.push(hexText.substring(groupStart, groupStart + groupSize));
				groupStart += groupSize;
			}
			hex.value = groups.join('-');
		},
		getData: ([hex]) => `"${hex.value.trim()}"`,
	},
	halves: {
		inputs: [
			document.getElementById('most'),
			document.getElementById('least'),
		],
		parse: ([most, least]) => {
			if (most.validity.valid) {
				uuid.setBigInt64(0, BigInt(most.value), false);
			}
			if (least.validity.valid) {
				uuid.setBigInt64(8, BigInt(least.value), false);
			}
		},
		unparse: ([most, least]) => {
			most.value = uuid.getBigInt64(0, false);
			least.value = uuid.getBigInt64(8, false);
		},
		getData: ([most, least]) => `Most:${most.value.trim()}L,Least:${least.value.trim()}L`,
	},
	array: {
		inputs: Array.from({ length: 4 },
			(_, i) => document.getElementById('array' + i)),
		parse: array => {
			for (let i = 0; i < array.length; i++) {
				if (array[i].validity.valid) {
					uuid.setInt32(i * 4, Number(array[i].value), false);
				}
			}
		},
		unparse: array => {
			for (let i = 0; i < array.length; i++) {
				array[i].value = uuid.getInt32(i * 4, false);
			}
		},
		getData: array => `[I;${array.map(e => e.value.trim()).join(',')}]`,
	},
};

function findElementUUIDViewId(el) {
	const viewEl = el.closest('.view');
	if (viewEl) return viewEl.dataset.viewId;
	return '';
}

function callUUIDViewEvent(view, event) {
	return view[event](view.inputs, view.constants || {});
}

function updateUUIDViews(changedViewId) {
	const changedView = uuidViews[changedViewId];
	if (changedView) {
		callUUIDViewEvent(changedView, 'parse');
	}
	for (const viewId in uuidViews) {
		if (viewId !== changedViewId) {
			callUUIDViewEvent(uuidViews[viewId], 'unparse');
		}
	}
}

function generateRandomUUID() {
	crypto.getRandomValues(uuidBytes);
	// Set version to 4 (random)
	uuidBytes[6] = (uuidBytes[6] & 0x0f) | (4 << 4);
	// Set variant to 1 (Leach–Salz)
	uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80;
	updateUUIDViews();
}

function loadUUIDFromHash() {
	const text = location.hash.substring(1);
	if (!text) return;
	
	if (/rand/i.test(text)) {
		generateRandomUUID();
		return;
	}

	const textGroups = text.split(',');
	for (const viewId in uuidViews) {
		const view = uuidViews[viewId];
		if (view.inputs.length === textGroups.length) {
			for (let i = 0; i < textGroups.length; i++) {
				view.inputs[i].value = textGroups[i];
			}
			updateUUIDViews(viewId);
			return;
		}
	}
	// No matching length, fall back to hex
	uuidViews.hex.inputs[0].value = text;
	updateUUIDViews('hex');
}

const clipboardText = document.getElementById('copy-area');
function copyTextToClipboard(text) {
	const focusedElement = document.activeElement;
	clipboardText.value = text;
	clipboardText.focus({ preventScroll: true });
	clipboardText.select();
	document.execCommand('copy');
	focusedElement.focus();
}

document.getElementById('gen-random').addEventListener('click', generateRandomUUID);

document.addEventListener('input', e => {
	const viewId = findElementUUIDViewId(e.target);
	if (viewId) {
		updateUUIDViews(viewId);
	}
});

document.addEventListener('paste', e => {
	const viewId = findElementUUIDViewId(e.target);
	const view = uuidViews[viewId];
	if (!view || view.inputs.length <= 1) return;
	
	for (const item of e.clipboardData.items) {
		if (item.kind === 'string' && item.type.startsWith('text/plain')) {
			item.getAsString(text => {
				const numbers = text.match(/[+-]?\d+/g);
				if (numbers && numbers.length === view.inputs.length) {
					for (let i = 0; i < numbers.length; i++) {
						view.inputs[i].value = numbers[i];
					}
					updateUUIDViews(viewId);
				}
			});
			break;
		}
	}
});

document.addEventListener('click', e => {
	const view = uuidViews[findElementUUIDViewId(e.target)];
	if (e.target.classList.contains('copy-data')) {
		copyTextToClipboard(callUUIDViewEvent(view, 'getData'));
	} else if (e.target.classList.contains('copy-link')) {
		const url = new URL(window.location);
		url.hash = view.inputs.map(e => e.value.trim()).join(',');
		copyTextToClipboard(url);
	}
});

window.addEventListener('hashchange', loadUUIDFromHash);
loadUUIDFromHash();
