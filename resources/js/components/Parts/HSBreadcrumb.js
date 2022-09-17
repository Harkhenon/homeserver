import React from 'react';
import { useLocation, Link } from 'react-router-dom';
import { Breadcrumb, Icon } from 'semantic-ui-react';

const HSBreadcrumb = () => {

  const location = useLocation();

  const locationArray = () => {
    const path = location.pathname;
    let urlArray = path.split('/');
    let numberOfEntries = urlArray.length;

    if(numberOfEntries === 1 && urlArray[0] === "") {
      return null;
    }
    if(urlArray[0] === "") {
      urlArray.shift();
    }
    if(numberOfEntries > 2 && urlArray[numberOfEntries - 1] === "") {
      urlArray.pop();
    }
    return urlArray;
  }

  const constructBreadcrumb = (urlArray) => {
    var finalBreadcrumb = [];
      for(let i=0;i<=(urlArray.length - 1);i++) {
        if(i === urlArray.length - 1) {
          finalBreadcrumb.push(
            <React.Fragment key={urlArray[i]}>
              <Breadcrumb.Divider icon='right arrow' />
              <Breadcrumb.Section key={urlArray[i]}>
                {urlArray[i].charAt(0).toUpperCase() + urlArray[i].slice(1)}
              </Breadcrumb.Section>
            </React.Fragment>
          );
        } else {
          finalBreadcrumb.push(
            <React.Fragment key={urlArray[i]}>
              <Breadcrumb.Divider icon='right angle' />
              <Breadcrumb.Section key={urlArray[i]} link as={Link} to={"/" + urlArray[i]}>
                {urlArray[i].charAt(0).toUpperCase() + urlArray[i].slice(1)}
              </Breadcrumb.Section>
            </React.Fragment>
          );
        }
      }

    return finalBreadcrumb;
  }

  return (
    <Breadcrumb>
      <Breadcrumb.Section link as={Link} to='/'>
        Home
      </Breadcrumb.Section>
      {constructBreadcrumb(locationArray())}
    </Breadcrumb>
  )
}

export default HSBreadcrumb;
