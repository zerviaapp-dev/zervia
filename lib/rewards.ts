/**
 * Rewards economy constants (points). 1 point = 1 cent of value.
 * The founder can adjust these — the database enforces safety, not amounts.
 */
export const SIGNUP_BONUS_POINTS = 100; // on email verification (DB trigger)
export const REFERRAL_BONUS_POINTS = 200; // to the referrer on redemption (DB trigger)
export const BOOKING_BONUS_POINTS = 50; // to the customer on completed booking (DB trigger)
export const REVIEW_BONUS_POINTS = 25; // to the reviewer on posting a review (DB trigger)

/** 7-day featured boost, purchasable with points (Phase 5 activates the boost). */
export const BOOST_COST_POINTS = 900;

/**
 * Merchant-offer marketing fee: 15% of the reward's cent value (1 pt = 1¢).
 * The database function redeem_offer() applies the same rate — keep them
 * in sync. See REWARDS-FINANCE-STUDY.md §2.4.
 */
export const OFFER_FEE_RATE = 0.15;

/** Referral codes look like ZB7K2Q9M: 'ZB' + 6 uppercase alphanumerics. */
export const REFERRAL_CODE_RE = /^ZB[A-Z0-9]{6}$/;
