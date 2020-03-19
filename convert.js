const uuid = new DataView(new ArrayBuffer(16));

const views = {
	hex: {
		inputs: {
			hex: document.getElementById('hex'),
			groupSizes: [8, 4, 4, 4, 12],
		},
		parse: ({hex, groupSizes}) => {
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
		unparse: ({hex, groupSizes}) => {
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
	},
	halves: {
		inputs: [
			document.getElementById('least'),
			document.getElementById('most'),
		],
		parse: ([least, most]) => {
			if (least.validity.valid) {
				uuid.setBigInt64(8, BigInt(least.value), false);
			}
			if (most.validity.valid) {
				uuid.setBigInt64(0, BigInt(most.value), false);
			}
		},
		unparse: ([least, most]) => {
			least.value = uuid.getBigInt64(8, false);
			most.value = uuid.getBigInt64(0, false);
		},
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
	},
};

function updateViews(changedView) {
	views[changedView].parse(views[changedView].inputs);
	for (const viewId in views) {
		if (viewId !== changedView) {
			views[viewId].unparse(views[viewId].inputs);
		}
	}
}

document.addEventListener('input', e => {
	const viewId = e.target.closest('.row').dataset.viewId;
	if (viewId) {
		updateViews(viewId);
	}
});

document.addEventListener('paste', e => {
	const rowData = e.target.closest('.row').dataset;
	const viewId = rowData.viewId;
	if (viewId && 'splitPaste' in rowData) {
		for (const item of e.clipboardData.items) {
			if (item.kind === 'string' && item.type.startsWith('text/plain')) {
				item.getAsString(text => {
					const numbers = text.match(/[+-]?\d+/g);
					if (numbers && numbers.length === views[viewId].inputs.length) {
						for (let i = 0; i < numbers.length; i++) {
							views[viewId].inputs[i].value = numbers[i];
						}
						updateViews(viewId);
					}
				});
				break;
			}
		}
	}
});
