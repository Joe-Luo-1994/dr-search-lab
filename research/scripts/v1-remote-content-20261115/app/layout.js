import './style.css';

export const metadata = {title: '異地唯讀搜尋', description: '合成資料研究環境'};

export default function RootLayout({children}) {
  return <html lang="zh-Hant"><body>{children}</body></html>;
}
