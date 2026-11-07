// Adem reduction for the finite input modules. The full resolution is delegated
// to ext-rs; this file only puts products into admissible Steenrod-word form.
// Odd-prime words use -1 for beta and positive integers for reduced powers.
export function binomial(n, r, p) {
  if (r < 0 || n < r) return 0;
  let answer = 1n;
  const prime = BigInt(p);

  // Lucas' theorem reduces the binomial coefficient digit-by-digit modulo p.
  while (n || r) {
    const a = n % p, b = r % p;
    if (b > a) return 0;
    let value = 1n;
    for (let j = 1; j <= Math.min(b, a - b); j++)
      value = value * BigInt(a - j + 1) / BigInt(j);
    answer = answer * (value % prime) % prime;
    n = Math.floor(n / p); r = Math.floor(r / p);
  }
  return Number(answer);
}

export function ademReducer(p) {
  const cache = new Map();
  const sign = exponent => exponent % 2 ? p - 1 : 1;
  const multiply = (a, b) => p < 67108864 ? a * b % p : Number(BigInt(a) * BigInt(b) % BigInt(p));

  function reduce(word) {
    const key = word.join(',');
    if (cache.has(key)) return cache.get(key);
    const answer = new Map();

    const expand = (at, count, terms) => {
      for (const [coefficient, replacement] of terms) {
        if (!coefficient) continue;
        const next = [...word.slice(0, at), ...replacement, ...word.slice(at + count)];
        for (const [target, value] of reduce(next)) {
          const sum = (answer.get(target) || 0) + multiply(coefficient, value);
          answer.set(target, sum % p);
        }
      }
      for (const [target, value] of answer) if (!value) answer.delete(target);
      cache.set(key, answer);
      return answer;
    };

    // Find the first inadmissible adjacent pair and apply the corresponding
    // Adem relation. Recursion terminates because each expansion moves toward
    // admissible words in the standard Steenrod basis.
    for (let i = 0; i < word.length - 1; i++) {
      const a = word[i], b = word[i + 1];
      if (p === 2 && a < 2 * b) {
        const terms = [];
        for (let j = 0; j <= Math.floor(a / 2); j++)
          terms.push([binomial(b - j - 1, a - 2 * j, p), [a + b - j, ...(j ? [j] : [])]]);
        return expand(i, 2, terms);
      }
      if (p === 2) continue;
      if (a === -1 && b === -1) return expand(i, 2, []);
      if (a < 0) continue;
      const epsilon = b === -1 ? 1 : 0;
      const right = word[i + 1 + epsilon];
      if (!right || right < 0 || a >= p * right + epsilon) continue;
      const terms = [];
      for (let j = 0; j <= Math.floor(a / p); j++) {
        const tail = j ? [j] : [];
        const c = multiply(sign(a + j), binomial((p - 1) * (right - j) - 1 + epsilon, a - p * j, p));
        terms.push([c, [...(epsilon ? [-1] : []), a + right - j, ...tail]]);
        if (epsilon) {
          const d = multiply(sign(a + j - 1), binomial((p - 1) * (right - j) - 1, a - p * j - 1, p));
          terms.push([d, [a + right - j, -1, ...tail]]);
        }
      }
      return expand(i, 2 + epsilon, terms);
    }
    answer.set(key, 1);
    cache.set(key, answer);
    return answer;
  }

  return reduce;
}
