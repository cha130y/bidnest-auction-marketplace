import { maskBidderName } from './mask-bidder-name.util';

describe('maskBidderName (BID-005)', () => {
  describe('what it reveals', () => {
    it('keeps the first and last character of a long name', () => {
      expect(maskBidderName('Somchai')).toBe('S***i');
    });

    it('reveals only the first of a two-character name', () => {
      expect(maskBidderName('Jo')).toBe('J*');
    });

    it('reveals nothing of a single character', () => {
      expect(maskBidderName('J')).toBe('*');
    });

    it('works the same on Thai names', () => {
      expect(maskBidderName('สมชาย')).toBe('ส***ย');
    });

    // Array.from, not slice: an emoji is one character to a reader
    it('does not cut a multi-byte character in half', () => {
      expect(maskBidderName('🙂ab🙃')).toBe('🙂***🙃');
    });
  });

  describe('when there is no name to mask', () => {
    it.each([
      ['null', null],
      ['undefined', undefined],
      ['an empty string', ''],
      ['only spaces', '   ']
    ])('falls back to stars for %s', (_case, value) => {
      expect(maskBidderName(value)).toBe('***');
    });
  });

  // the same bidder has to read as the same person down the list
  it('is stable: the same name always masks the same way', () => {
    expect(maskBidderName('Somchai')).toBe(maskBidderName('Somchai'));
  });

  // the mask is a fixed three stars, so a long name and a short one that
  // begin and end alike are indistinguishable
  it('does not leak how long the name was', () => {
    expect(maskBidderName('Bob')).toBe(maskBidderName('Bartholomeb'));
    expect(maskBidderName('สมชาย')).toHaveLength(
      maskBidderName('สมหญิงจงเจริญย').length
    );
  });

  it('trims before masking, so padding cannot shift what shows', () => {
    expect(maskBidderName('  Somchai  ')).toBe('S***i');
  });
});
