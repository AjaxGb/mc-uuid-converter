const uuidBytes = new Uint8Array(16);
const uuid = new DataView(uuidBytes.buffer);

class PlayerNameInput extends EventTarget {
	constructor(input, canvas, spinner) {
		super();
		this.input = input;
		this.input.addEventListener('input', () => {
			this.input.setCustomValidity('');
			this.input.checkValidity();
			this.loadPlayer(this.input.value.trim(), true, true);
		});
		this.input.addEventListener('change', () => {
			this.loadPlayer(this.input.value.trim(), false, true);
		});
		
		this.canvas = canvas;
		this.ctx = canvas.getContext('2d');
		this.texture = new Image();
		this.texture.onload = () => this.drawFace();
		this.texture.onerror = () => this.clearFace();

		this.spinner = spinner;
		this.requestDelay = null;
		this.abortController = null;
		
		this.loadedNameOrUuid = null;
		this.playerData = null;
	}

	cancel() {
		if (this.requestDelay !== null) {
			clearTimeout(this.requestDelay);
			this.requestDelay = null;
		}
		if (this.abortController) {
			this.abortController.abort('interrupted');
			this.abortController = null;
		}
	}
	
	clear(clearInput=true) {
		this.loadedNameOrUuid = null;
		this.playerData = null;
		if (clearInput) {
			this.input.value = '';
		}
		this.input.setCustomValidity('');
		this.input.checkValidity();
		this.clearFace();
	}
	
	loadPlayer(nameOrUuid, useTimeout, isInternalLoad=false) {
		const alreadyLoaded = [this.loadedNameOrUuid];
		if (this.playerData) {
			alreadyLoaded.push(this.playerData.username);
			alreadyLoaded.push(this.playerData.uuid);
		}
		if (alreadyLoaded.indexOf(nameOrUuid) >= 0) {
			return;
		}
		if (!isInternalLoad) {
			this.input.value = '';
			this.clearFace();
		}
		this.cancel();
		if (useTimeout) {
			this.requestDelay = setTimeout(
				() => this.loadPlayer(nameOrUuid, false, isInternalLoad),
				1000);
		} else {
			this.clear(!isInternalLoad);
			if (nameOrUuid) {
				this.abortController = new AbortController();
				this.makeRequest(nameOrUuid, this.abortController.signal, isInternalLoad);
			}
		}
	}
	
	reportError(message, nameOrUuid, checkErrors) {
		if (checkErrors) {
			this.input.setCustomValidity(message);
			this.input.checkValidity();
			this.dispatchEvent(new Event('error'));
		}
		this.loadedNameOrUuid = nameOrUuid;
		this.playerData = null;
		this.clearFace();
	}
	
	async makeRequest(nameOrUuid, signal, isInternalLoad) {
		try {
			const url = 'https://api.ashcon.app/mojang/v2/user/' + encodeURIComponent(nameOrUuid);;
			console.log('Requesting ', url);
			this.spinner.classList.add('loading');
			
			const response = await fetch(url, {
				mode: 'cors',
				signal: signal,
			});
			if (response.status === 404) {
				console.error('No player found for: ', nameOrUuid);
				return this.reportError(
					'No such player', nameOrUuid, isInternalLoad);
			}
			const data = await response.json();
			
			if (signal.aborted) return;
			this.abortController = null;
			
			if (!data.uuid || !data.username) {
				console.error('Loading player data failed: ', data);
				return this.reportError(
					'Failed to get data', nameOrUuid, isInternalLoad);
			}
			
			this.loadedNameOrUuid = nameOrUuid;
			this.playerData = data;
			if (this.input.value !== data.username) {
				this.input.value = data.username;
			}
			if (data.textures && data.textures.skin) {
				this.texture.src = 'data:image/png;base64,' + data.textures.skin.data;
			}
			this.dispatchEvent(new Event('load'));
		} catch (err) {
			if (err.name === 'AbortError') return;
			console.error('Loading player data failed: ', err);
			return this.reportError(
				'Failed to get data', nameOrUuid, isInternalLoad);
		} finally {
			this.spinner.classList.remove('loading');
		}
	}
	
	drawFace() {
		this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
		this.ctx.drawImage(this.texture, 8, 8, 8, 8, 0, 0, this.canvas.width, this.canvas.height);
		this.ctx.drawImage(this.texture, 40, 8, 8, 8, 0, 0, this.canvas.width, this.canvas.height);
	}
	
	clearFace() {
		if (this.texture.src !== 'data:,') {
			this.texture.src = 'data:,';
		}
		this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
	}
}

const playerNameInput = new PlayerNameInput(
	document.getElementById('player-name'),
	document.getElementById('player-face'),
	document.getElementById('player-spinner'),
);

const UUID_GROUP_SIZES = [8, 4, 4, 4, 12];

function parseUUID(hex, intoView) {
	hex = hex.trim();
	if (hex.includes('-')) {
		hex = hex
			.split('-')
			.map((g, i) => g.padStart(UUID_GROUP_SIZES[i], '0'))
			.join('');
	} else {
		hex = hex.padStart(32, '0');
	}
	intoView.setBigUint64(0, BigInt('0x' + hex.substring(0, 16)), false);
	intoView.setBigUint64(8, BigInt('0x' + hex.substring(16)), false);
}

function unparseUUID(view) {
	const hex = (
		view.getBigUint64(0, false).toString(16).padStart(16, '0') +
		view.getBigUint64(8, false).toString(16).padStart(16, '0'));
	const groups = [];
	let groupStart = 0;
	for (const groupSize of UUID_GROUP_SIZES) {
		groups.push(hex.substring(groupStart, groupStart + groupSize));
		groupStart += groupSize;
	}
	return groups.join('-');
}

const uuidViews = {
	hex: {
		inputs: [
			document.getElementById('hex')
		],
		parse: ([hex]) => {
			if (!hex.validity.valid) return;
			parseUUID(hex.value, uuid);
		},
		unparse: ([hex]) => {
			hex.value = unparseUUID(uuid);
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
	player: {
		inputs: [
			playerNameInput,
		],
		parse: ([playerName]) => {
			if (playerName.playerData) {
				parseUUID(playerName.playerData.uuid, uuid);
			} else {
				uuidBytes.fill(0);
			}
		},
		unparse: ([playerName], isFinal) => {
			playerName.loadPlayer(unparseUUID(uuid), !isFinal);
		},
	}
};

function findElementUUIDViewId(el) {
	const viewEl = el.closest('.view');
	if (viewEl) return viewEl.dataset.viewId;
	return '';
}

function callUUIDViewEvent(view, event, ...args) {
	return view[event](view.inputs, ...args);
}

function updateUUIDViews(changedViewId, isFinal) {
	const changedView = uuidViews[changedViewId];
	if (changedView) {
		callUUIDViewEvent(changedView, 'parse', isFinal);
	}
	for (const viewId in uuidViews) {
		if (viewId !== changedViewId) {
			callUUIDViewEvent(uuidViews[viewId], 'unparse', isFinal);
		}
	}
}

function generateRandomUUID() {
	crypto.getRandomValues(uuidBytes);
	// Set version to 4 (random)
	uuidBytes[6] = (uuidBytes[6] & 0x0f) | (4 << 4);
	// Set variant to 1 (Leach–Salz)
	uuidBytes[8] = (uuidBytes[8] & 0x3f) | 0x80;
	updateUUIDViews(null, true);
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
			updateUUIDViews(viewId, true);
			return;
		}
	}
	// No matching length, fall back to hex
	uuidViews.hex.inputs[0].value = text;
	updateUUIDViews('hex', true);
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
		updateUUIDViews(viewId, false);
	}
});

document.addEventListener('change', e => {
	const viewId = findElementUUIDViewId(e.target);
	if (viewId) {
		updateUUIDViews(viewId, true);
	}
});

playerNameInput.addEventListener('load', () => updateUUIDViews('player', true));
playerNameInput.addEventListener('error', () => updateUUIDViews('player', true));

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
