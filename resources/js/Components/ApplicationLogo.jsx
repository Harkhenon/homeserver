import Logo from '@img/logo.png';

export default function ApplicationLogo({ size }) {
  let width = 16;
  switch (size) {
    case 'sm':
      width = 16;
      break;
    case 'lg':
      width = 32;
      break;
    case 'xl':
      width = 64;
      break;
    case '2xl':
      width = 128;
      break;
    case '3xl':
      width = 256;
      break;
  }

  return <img src={Logo} title="logo" alt="Logo" width={width} height="auto" />;
}
