// Diferencias relativas muy pequeñas, con coma decimal: «< 10⁻¹²» o «4,2e-16».
export const tiny = (x: number) => (!(x >= 1e-12) ? 'menor de 10⁻¹²' : x.toExponential(1).replace('.', ','));
