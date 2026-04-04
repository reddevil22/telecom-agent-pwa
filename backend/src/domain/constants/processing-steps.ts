/**
 * Standardized processing step labels used across all sub-agents
 * This ensures consistency in the UI progress indicators
 */

export const ProcessingStepLabels = {
  // Common steps
  UNDERSTAND: 'Understanding your request',
  PREPARING: 'Preparing response',

  // Balance operations
  FETCHING_BALANCE: 'Fetching account balance',

  // Bundle operations
  RETRIEVING_BUNDLES: 'Retrieving available bundles',
  FINDING_BUNDLE: 'Finding bundle',
  CHECKING_BALANCE: 'Checking balance',
  PREPARING_DETAILS: 'Preparing details',
  VALIDATING_BUNDLE: 'Validating bundle',
  PROCESSING_PURCHASE: 'Processing purchase',

  // Usage operations
  FETCHING_USAGE: 'Fetching usage data',

  // Support operations
  LOADING_SUPPORT: 'Loading support options',
  LOADING_FAQ: 'Loading FAQ',
  CREATING_TICKET: 'Creating ticket',
  CONFIRMING_SUBMISSION: 'Confirming submission',

  // Top-up operations
  VALIDATING_AMOUNT: 'Validating amount',
  PROCESSING_TOPUP: 'Processing top-up',
  UPDATING_BALANCE: 'Updating balance',
} as const;

/**
 * Standard error messages used across sub-agents
 */
export const ErrorMessages = {
  INVALID_AMOUNT: 'Invalid amount. Please specify a positive number to top up.',
  NO_BUNDLE_SPECIFIED: 'No bundle specified. Please select a bundle to purchase.',
  USER_NOT_FOUND: (userId: string) => `User ${userId} not found`,
  BUNDLE_NOT_FOUND: 'Bundle not found',
  INSUFFICIENT_BALANCE: 'Insufficient balance',
} as const;

/**
 * Standard confirmation titles
 */
export const ConfirmationTitles = {
  SUCCESS: 'Success!',
  FAILED: 'Failed',
  TOPUP_SUCCESS: 'Top-up Successful!',
  TOPUP_FAILED: 'Top-up Failed',
  PURCHASE_SUCCESS: 'Bundle Purchased!',
  PURCHASE_FAILED: 'Purchase Failed',
  TICKET_CREATED: 'Support Ticket Created',
} as const;
