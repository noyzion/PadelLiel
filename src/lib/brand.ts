/**
 * Brand constants shared by the UI.
 *
 * The logo is the original Israel Tennis Centers emblem supplied by the project owner, stored untouched in
 * public/brand/. It is only cropped to a circle by CSS and never redrawn or recoloured.
 */
export const COMMUNITY_NAME = 'אימוני פאדל לנשים';
export const VENUE_NAME = 'מרכז הטניס כוכב יאיר';
export const VENUE_SHORT = 'כוכב יאיר';
export const COACH_NAME = 'הצוות שלנו';

export const VENUE_LOGO: { src: string; width: number; height: number; alt: string } | null = {
  src: '/brand/tennis-centers-logo.png',
  width: 447,
  height: 447,
  alt: 'מרכזי הטניס והחינוך בישראל',
};
