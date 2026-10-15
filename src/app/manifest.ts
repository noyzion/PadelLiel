import type { MetadataRoute } from 'next';

/** Web app manifest: lets the trainees install the app to their Home Screen (required for Push on iPhone). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'אימוני פאדל לנשים כוכב יאיר',
    short_name: 'פאדל כוכב יאיר',
    description: 'הרשמה לאימוני פאדל של קהילת הנשים בכוכב יאיר',
    lang: 'he',
    dir: 'rtl',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fcfaf9',
    theme_color: '#012653',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
