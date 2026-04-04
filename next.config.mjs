/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse", "exceljs", "pptxgenjs", "docx"],
  },
};

export default nextConfig;
