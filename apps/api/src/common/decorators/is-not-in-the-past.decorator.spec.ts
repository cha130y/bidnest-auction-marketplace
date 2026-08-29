import { IsDate, IsOptional, validate } from 'class-validator';
import { IsNotInThePast } from './is-not-in-the-past.decorator';

const GRACE_MS = 60 * 1000;

class Probe {
  @IsOptional()
  @IsDate()
  @IsNotInThePast(GRACE_MS)
  at?: Date;

  constructor(at?: Date) {
    this.at = at;
  }
}

const codesOf = async (at?: Date) => {
  const errors = await validate(new Probe(at));
  return errors.flatMap((error) => Object.keys(error.constraints ?? {}));
};

const msFromNow = (ms: number) => new Date(Date.now() + ms);

describe('IsNotInThePast', () => {
  it('accepts a time still to come', async () => {
    await expect(codesOf(msFromNow(60 * 60 * 1000))).resolves.toEqual([]);
  });

  it('rejects a time that has gone by', async () => {
    await expect(codesOf(msFromNow(-24 * 60 * 60 * 1000))).resolves.toEqual([
      'isNotInThePast'
    ]);
  });

  it('names the property it refused, so the seller knows which field', async () => {
    const [error] = await validate(new Probe(msFromNow(-24 * 60 * 60 * 1000)));

    expect(error.constraints?.isNotInThePast).toBe(
      'at must not be in the past'
    );
  });

  // The whole reason the grace exists: a form offering minutes cannot express
  // "now" any more precisely than the minute it is already inside.
  it('accepts a time inside the grace window', async () => {
    await expect(codesOf(msFromNow(-GRACE_MS / 2))).resolves.toEqual([]);
  });

  it('rejects a time just outside the grace window', async () => {
    await expect(codesOf(msFromNow(-GRACE_MS - 1000))).resolves.toEqual([
      'isNotInThePast'
    ]);
  });

  it('leaves an absent value to @IsOptional', async () => {
    await expect(codesOf(undefined)).resolves.toEqual([]);
  });

  // One field, one complaint: what is wrong with a non-date is @IsDate's to say
  it('leaves a value that is not a date to @IsDate alone', async () => {
    await expect(codesOf('yesterday' as unknown as Date)).resolves.toEqual([
      'isDate'
    ]);
  });
});
