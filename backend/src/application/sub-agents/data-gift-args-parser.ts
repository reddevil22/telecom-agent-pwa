/**
 * Shared argument parsing for data gift flows.
 * Used by both DataGiftSubAgent and SupervisorService.buildDataGiftConfirmation.
 */
export class DataGiftArgsParser {
  /**
   * Parse a raw amount string like "2 GB", "500 MB", "1.5GB" into megabytes.
   * Returns 0 if the string cannot be parsed.
   */
  static parseAmount(amount: string): number {
    const match = amount.match(/^(\d+(?:\.\d+)?)\s*(GB|MB)/i);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    const unit = match[2].toUpperCase();
    return unit === "GB" ? Math.round(value * 1024) : Math.round(value);
  }

  /**
   * Format megabytes into a human-readable string (e.g., "2.0 GB", "500 MB").
   */
  static formatMb(mb: number): string {
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
  }
}