import { capacityKgFromPalletWeightKg } from './capacityFromPallet';

describe('capacityKgFromPalletWeightKg', () => {
  it('returns twice the pallet weight (kg)', () => {
    expect(capacityKgFromPalletWeightKg(500)).toBe(1000);
    expect(capacityKgFromPalletWeightKg(1000)).toBe(2000);
  });
});
