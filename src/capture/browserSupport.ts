export function isBraveBrandList(brands: readonly { brand: string }[] | undefined): boolean {
  return brands?.some((item) => item.brand === "Brave") ?? false;
}
