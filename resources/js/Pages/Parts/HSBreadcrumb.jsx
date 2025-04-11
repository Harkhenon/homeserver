import { Link as InertiaLink } from '@inertiajs/react';
import { Box, Breadcrumbs, Link, Typography } from '@mui/material';

//import '@sass/Parts/HSBreadcrumb.scss';

export default function HSBreadcrumb() {
  const location = window.location;

  const locationArray = () => {
    const path = location.pathname;
    let urlArray = path.split('/');
    let numberOfEntries = urlArray.length;

    if (numberOfEntries === 1 && urlArray[0] === '') {
      return null;
    }
    if (urlArray[0] === '') {
      urlArray.shift();
    }
    if (numberOfEntries > 2 && urlArray[numberOfEntries - 1] === '') {
      urlArray.pop();
    }
    return urlArray;
  };

  const constructBreadcrumb = (urlArray) => {
    var finalBreadcrumb = [];
    for (let i = 0; i <= urlArray.length - 1; i++) {
      if (i === urlArray.length - 1) {
        finalBreadcrumb.push(
          <Typography key={urlArray[i]} sx={{ color: 'text.primary' }}>
            {urlArray[i].charAt(0).toUpperCase() + urlArray[i].slice(1)}
          </Typography>,
        );
      } else {
        finalBreadcrumb.push(
          <Link
            component={InertiaLink}
            key={urlArray[i]}
            href={'/' + urlArray[i]}
          >
            {urlArray[i].charAt(0).toUpperCase() + urlArray[i].slice(1)}
          </Link>,
        );
      }
    }

    if (urlArray.length >= 1 && urlArray[0] !== '') {
      finalBreadcrumb.unshift(
        <Link component={InertiaLink} key="Home" href={route('welcome')}>
          Home
        </Link>,
      );
    }

    return finalBreadcrumb;
  };

  return (
    <Box className="hsbreadcrumb">
      <Breadcrumbs aria-label="breadcrumb">
        {constructBreadcrumb(locationArray())}
      </Breadcrumbs>
    </Box>
  );
}
