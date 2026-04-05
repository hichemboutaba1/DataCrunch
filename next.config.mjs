/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      "pdf-parse",
      "exceljs",
      "pptxgenjs",
      "docx",
      "@mistralai/mistralai",
    ],
  },
};

export default nextConfig;
