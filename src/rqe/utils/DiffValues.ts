

import { recordFailure } from '../FailureTracking'

type ValueType = 'boolean' | 'number' | 'string' | 'array' | 'object' | 'null' | 'undefined'

export interface ValueDiff {
    equal: boolean
    path?: any[]
    description?: string
}

function getValueType(value: any): ValueType {
    switch (typeof value) {
    case 'boolean':
        return 'boolean';
    case 'string':
        return 'string';
    case 'number':
        return 'number';
    case 'undefined':
        return 'undefined';
    }

    if (Array.isArray(value))
        return 'array';

    if (value === null)
        return 'null'

    return 'object'
}

export function diffValues(value, other) {
	if (value === other) {
        return { equal: true };
    }

    const valueType = getValueType(value);
    const otherType = getValueType(other);

    if (valueType !== otherType) {
        return {
            equal: false,
            description: `values have different type: ${valueType} != ${otherType}`,
        }
    }

    if (valueType === 'null' || valueType === 'undefined') {
        return { equal: true }
    }

    if (valueType === 'string') {
        if (value !== other) {
            return {
                equal: false,
                description: `string values are not the same: "${value}" != "${other}"`,
            }
        }

        return { equal: true, }
    }

    if (valueType === 'boolean') {
        if (value !== other) {
            return {
                equal: false,
                description: `boolean values are not the same: "${value}" != "${other}"`,
            }
        }

        return { equal: true, }
    }

    if (valueType === 'number') {
        if (value === NaN && other === NaN)
            return { equal: true }

        if (value !== other) {
            return {
                equal: false,
                description: `number values are not the same: ${value} != ${other}`,
            }
        }

        return { equal: true }
    }

    if (valueType === 'array') {
        if (value.length !== other.length) {
            return {
                equal: false,
                description: `array values have different length: ${value.length} != ${other.length}`,
            }
        }

        for (let i=0; i < value.length; i++) {
            const elementDiff = diffValues(value[i], other[i]);
            if (!elementDiff.equal) {
                return {
                    equal: false,
                    path: [i].concat(elementDiff.path || []),
                    description: elementDiff.description,
                }
            }
        }

        return { equal: true, }
    }

    if (valueType === 'object') {
        for (const [ key, entryValue ] of Object.entries(value)) {

            if (value[key] === undefined)
                // check if the value really 'has' the key, this check is needed if hasOwnProperty(key)
                // is true but the value === undefined.
                continue;

            if (other[key] === undefined) {
                return {
                    equal: false,
                    description: `rhs object does not have key '${key}': ${JSON.stringify(other)}`,
                }
            }

            const elementDiff = diffValues(value[key], other[key]);

            if (!elementDiff.equal) {
                return {
                    equal: false,
                    path: [key].concat(elementDiff.path || []),
                    description: elementDiff.description,
                }
            }
        }

        return { equal: true }
    }

    /*
	var valIsDate = isDate(value);
	var otherIsDate = isDate(other);
	if (valIsDate || otherIsDate) {
		if (!valIsDate) { return 'second argument is Date, first is not'; }
		if (!otherIsDate) { return 'first argument is Date, second is not'; }
		var valTime = +value;
		var otherTime = +other;
		if (valTime !== otherTime) {
			return 'Dates have different time values: ' + valTime + ' !== ' + otherTime;
		}
	}

	var valIsRegex = isRegex(value);
	var otherIsRegex = isRegex(other);
	if (valIsRegex || otherIsRegex) {
		if (!valIsRegex) { return 'second argument is RegExp, first is not'; }
		if (!otherIsRegex) { return 'first argument is RegExp, second is not'; }
		var regexStringVal = String(value);
		var regexStringOther = String(other);
		if (regexStringVal !== regexStringOther) {
			return 'regular expressions differ: ' + regexStringVal + ' !== ' + regexStringOther;
		}
	}

	var valueIsSym = isSymbol(value);
	var otherIsSym = isSymbol(other);
	if (valueIsSym !== otherIsSym) {
		if (valueIsSym) { return 'first argument is Symbol; second is not'; }
		return 'second argument is Symbol; first is not';
	}
	if (valueIsSym && otherIsSym) {
		return symbolValue.call(value) === symbolValue.call(other) ? '' : 'first Symbol value !== second Symbol value';
	}

	var valueIsBigInt = isBigInt(value);
	var otherIsBigInt = isBigInt(other);
	if (valueIsBigInt !== otherIsBigInt) {
		if (valueIsBigInt) { return 'first argument is BigInt; second is not'; }
		return 'second argument is BigInt; first is not';
	}
	if (valueIsBigInt && otherIsBigInt) {
		return bigIntValue.call(value) === bigIntValue.call(other) ? '' : 'first BigInt value !== second BigInt value';
	}

	var valueIsGen = isGenerator(value);
	var otherIsGen = isGenerator(other);
	if (valueIsGen !== otherIsGen) {
		if (valueIsGen) { return 'first argument is a Generator function; second is not'; }
		return 'second argument is a Generator function; first is not';
	}

	var valueIsArrow = isArrowFunction(value);
	var otherIsArrow = isArrowFunction(other);
	if (valueIsArrow !== otherIsArrow) {
		if (valueIsArrow) { return 'first argument is an arrow function; second is not'; }
		return 'second argument is an arrow function; first is not';
	}

	var valueIsCallable = isCallable(value);
	var otherIsCallable = isCallable(other);
	if (valueIsCallable || otherIsCallable) {
		if (functionsHaveNames && whyNotEqual(value.name, other.name) !== '') {
			return 'Function names differ: "' + value.name + '" !== "' + other.name + '"';
		}
		if (whyNotEqual(value.length, other.length) !== '') {
			return 'Function lengths differ: ' + value.length + ' !== ' + other.length;
		}

		var valueStr = normalizeFnWhitespace(String(value));
		var otherStr = normalizeFnWhitespace(String(other));
		if (
			whyNotEqual(valueStr, otherStr) !== ''
			&& !(
				!valueIsGen
				&& !valueIsArrow
				&& whyNotEqual(valueStr.replace(/\)\s*\{/, '){'), otherStr.replace(/\)\s*\{/, '){')) === ''
			)
		) {
			return 'Function string representations differ';
		}
	}
    */

	
   recordFailure('diff_values_fallthrough', { valueType });
}
