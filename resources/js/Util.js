export function deepEqual(object1, object2) {
  const keys1 = Object.keys(object1);
  const keys2 = Object.keys(object2);
  if (keys1.length !== keys2.length) {
    return false;
  }
  for (const key of keys1) {
    const val1 = object1[key];
    const val2 = object2[key];
    const areObjects = isObject(val1) && isObject(val2);
    if (
      (areObjects && !deepEqual(val1, val2)) ||
      (!areObjects && val1 !== val2)
    ) {
      return false;
    }
  }
  return true;
}

export function isObject(object) {
  return object != null && typeof object === 'object';
}

export function parseInputsNames(inputs, separator = ':') {
  let parsedInputs = {};
  for (let key in inputs) {
    console.log(key);
    if (key.split(separator).length === 1) {
      parsedInputs[key] = inputs[key];
    } else {
      parsedInputs[key.split(separator)[0]][key.split(separator)[1]] =
        inputs[key];
    }
  }

  return parsedInputs;
}
