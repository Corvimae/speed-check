import '../styles/globals.css'
import type { AppProps } from 'next/app'

import 'react-tippy/dist/tippy.css';

function MyApp({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}

export default MyApp
