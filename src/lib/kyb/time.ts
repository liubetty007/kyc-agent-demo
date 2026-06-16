export function parseISO(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

export function isAfter(a: Date, b: Date): boolean {
  return a.getTime() > b.getTime();
}
