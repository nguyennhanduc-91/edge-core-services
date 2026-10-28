const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Cấu hình lưu trữ Chrome trực tiếp trong thư mục project
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
