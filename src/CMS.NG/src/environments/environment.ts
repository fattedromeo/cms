export const environment = {
  production: false,
  apiUrl: 'http://localhost:5000/api',
  /** Public-facing course site. Target of the course detail QR code, not an API base. */
  publicSiteUrl: 'https://www.uuu.com.tw',
  /**
   * Course flyer branding + counter contact (spec/course/CourseFlyer.md). Environment files are
   * this repo's home for deploy-swappable facts. Contact values are copied verbatim from the dev
   * DB's TrainingCenter IsDefault=1 row — never invented (a wrong phone number on printed
   * collateral is a silent failure that surfaces in a customer's hand).
   */
  flyer: {
    textMark: 'UWA',
    siteLabel: 'www.uuu.com.tw',
    address: '台北市復興北路99號14 樓',
    phone: '(02)25149191 分機100',
    email: 'UCOM@uuu.com.tw',
  },
};
