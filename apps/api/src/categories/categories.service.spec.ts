import { slugify } from './categories.service';

describe('slugify (ADM-003)', () => {
  it('lowercases and joins words with dashes', () => {
    expect(slugify('Home And Garden')).toBe('home-and-garden');
  });

  it('keeps Thai vowels and tone marks', () => {
    // These are combining marks, not letters. A letters-and-digits-only
    // pattern drops them and leaves "เคร-องใช-ไฟฟ-า".
    expect(slugify('เครื่องใช้ไฟฟ้า')).toBe('เครื่องใช้ไฟฟ้า');
  });

  it('collapses punctuation into a single dash', () => {
    expect(slugify('ของสะสม / มือสอง')).toBe('ของสะสม-มือสอง');
    expect(slugify('a   b')).toBe('a-b');
  });

  it('trims dashes off both ends', () => {
    expect(slugify('  spaced  ')).toBe('spaced');
    expect(slugify('--edge--')).toBe('edge');
  });

  it('returns empty when there is nothing to slug', () => {
    // The service turns this into a 400 rather than storing a blank slug.
    expect(slugify('---')).toBe('');
    expect(slugify('   ')).toBe('');
  });

  it('keeps digits', () => {
    expect(slugify('Gen 2 Consoles')).toBe('gen-2-consoles');
  });
});
