export const environment = {
  production: true,
  apiUrl: '/api',
  /** Public-facing course site. Target of the course detail QR code, not an API base. */
  publicSiteUrl: 'https://www.uuu.com.tw',
  /** Course flyer branding + counter contact — keep in sync with environment.ts (see comment there). */
  flyer: {
    textMark: 'UWA',
    siteLabel: 'www.uuu.com.tw',
    address: '台北市復興北路99號14 樓',
    phone: '(02)25149191 分機100',
    email: 'UCOM@uuu.com.tw',
  },
};
