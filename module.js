import { ademReducer } from './steenrod.js';

const MAX_ENGINE_DEGREE = 2_147_483_646;

export function validateInputs(n, prime, range, filtration, m = null) {
  if (![n, prime, range, filtration].every(Number.isSafeInteger)
    || (m !== null && !Number.isSafeInteger(m))) {
    throw Error('Enter whole numbers.');
  }
  if (n < 0) throw Error('Sphere dimension must be a nonnegative integer.');
  if (range < 0 || filtration < 0) throw Error('Range and filtration must be nonnegative.');
  if (prime < 2 || prime > 1_073_741_823) {
    throw Error('Choose a prime between 2 and 1073741823.');
  }
  if (!isPrime(prime)) throw Error('The chosen prime is not prime.');
  if (prime !== 2 && n % 2 === 0) {
    throw Error('Even sphere dimensions are supported only at prime 2. Choose prime 2 or an odd dimension.');
  }
  if (m !== null) {
    if (m <= n) throw Error('The target dimension must be strictly larger than the source dimension.');
    if (prime !== 2 && m % 2 === 0) {
      throw Error('Even target dimensions are supported only at prime 2. Choose prime 2 or an odd target dimension.');
    }
  }
  if (range + filtration + n > MAX_ENGINE_DEGREE) {
    throw Error('These degrees exceed the resolution engine’s integer range.');
  }
}

function isPrime(value) {
  for (let divisor = 2; divisor * divisor <= value; divisor++) {
    if (value % divisor === 0) return false;
  }
  return true;
}

/** The first layer whose successor starts above the requested range. */
export function lastLayer(n, prime, range) {
  let k = 0;
  let power = BigInt(prime);
  while (BigInt(range) >= nextLayerBottom(n, power, k)) {
    k++;
    power *= BigInt(prime);
  }
  return k;
}

function nextLayerBottom(n, power, k) {
  return BigInt(n + 1) * power - BigInt(2 * k + 3);
}

export function bottomDegree(n, prime, k) {
  return k === 0 ? n : (n + 1) * prime ** k - 2 * k - 1;
}

function enumerateBasis(n, prime, k, maximum, targetDimension) {
  const basis = [];

  function add(word, degree) {
    basis.push({ word, degree });
  }

  function enumerateSquares(word, degree) {
    const length = word.length;
    if (length === k) {
      add(word, degree);
      return;
    }
    const remaining = k - length;
    const first = length ? 2 * word[0] : n + 1;
    // The smallest possible remaining word has exponents a, 2a, ..., 2^(r-1)a.
    const minimumWeight = 2 ** remaining - 1;
    const upperExponent = length ? Infinity : targetDimension ?? Infinity;
    for (let exponent = first; exponent <= upperExponent && degree + minimumWeight * exponent <= maximum; exponent++) {
      enumerateSquares([exponent, ...word], degree + exponent);
    }
  }

  function enumerateOddPrimeWords(word, degree) {
    const length = word.filter(value => value >= 0).length;
    if (length === k) {
      add(word, degree);
      return;
    }
    const hasLeadingBeta = word[0] === -1;
    const nextPower = word[hasLeadingBeta ? 1 : 0] || 0;
    const nextBeta = hasLeadingBeta ? 1 : 0;
    const first = length ? prime * nextPower + nextBeta : (n + 1) / 2;
    const remaining = k - length;
    const minimumWeight = (prime ** remaining - 1) / (prime - 1);
    const powerDegree = 2 * (prime - 1);

    const upperExponent = length ? Infinity : targetDimension ?? Infinity;
    for (let exponent = first; exponent <= upperExponent && degree + powerDegree * minimumWeight * exponent <= maximum; exponent++) {
      for (let beta = 0; beta <= 1; beta++) {
        const nextDegree = degree + powerDegree * exponent + beta;
        if (nextDegree <= maximum) {
          enumerateOddPrimeWords([...(beta ? [-1] : []), exponent, ...word], nextDegree);
        }
      }
    }
  }

  if (prime === 2) enumerateSquares([], 0);
  else enumerateOddPrimeWords([], 0);
  return basis;
}

function buildOperations(prime, cutoff) {
  const operations = [];
  if (prime !== 2) operations.push({ name: 'b', word: [-1], degree: 1 });

  const firstDegree = prime === 2 ? 1 : 2 * (prime - 1);
  for (let exponent = 1, degree = firstDegree; degree <= cutoff; exponent *= prime, degree *= prime) {
    operations.push({ name: `${prime === 2 ? 'Sq' : 'P'}${exponent}`, word: [exponent], degree });
  }
  return operations;
}

function buildActions(basis, prime, cutoff) {
  const reduce = ademReducer(prime);
  const operations = buildOperations(prime, cutoff);
  const byWord = new Map(basis.map(entry => [entry.word.join(','), entry]));
  const actions = [];

  // ext-rs receives only nonzero actions whose source and target are in the truncation.
  for (const source of basis) {
    for (const operation of operations) {
      if (source.degree + operation.degree > cutoff) continue;
      const targets = [];
      for (const [word, coefficient] of reduce([...operation.word, ...source.word])) {
        const target = byWord.get(word);
        if (target) {
          const scalar = coefficient === 1 ? '' : `${coefficient} `;
          targets.push(`${scalar}${target.name}`);
        }
      }
      if (targets.length) actions.push(`${operation.name} ${source.name} = ${targets.join(' + ')}`);
    }
  }
  return actions;
}

/**
 * Build the finite Steenrod-algebra module sent to ext-rs.
 *
 * The module is translated so its bottom degree is zero. `bottom` is returned
 * separately so the UI can put the Ext classes back in their original degrees.
 */
export function layerModule(n, prime, k, cutoff, m = null) {
  const bottom = bottomDegree(n, prime, k);
  if (k === 0) {
    return {
      module: { p: prime, type: 'finite dimensional module', gens: { unit: 0 }, actions: [] },
      bottom,
      basis: [{ name: 'unit', word: [], degree: 0 }]
    };
  }

  const shift = n - 2 * k;
  const maximum = cutoff + bottom - shift;
  const targetExponent = m === null ? null : (prime === 2 ? m : (m - 1) / 2);
  const basis = enumerateBasis(n, prime, k, maximum, targetExponent);
  basis.sort((a, b) => a.degree - b.degree || a.word.join(',').localeCompare(b.word.join(',')));
  basis.forEach((entry, index) => {
    entry.name = `x${index}`;
    entry.degree += shift - bottom;
  });

  const actions = buildActions(basis, prime, cutoff);
  return {
    module: {
      p: prime,
      type: 'finite dimensional module',
      gens: Object.fromEntries(basis.map(entry => [entry.name, entry.degree])),
      actions
    },
    bottom,
    basis
  };
}
