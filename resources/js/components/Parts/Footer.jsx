import React from 'react';

import { Grid, GridColumn, GridRow, Icon } from 'semantic-ui-react';

const Footer = () => {
  return (
    <footer>
      <Grid>
        <GridRow>
          Homeserver 2022
        </GridRow>
        <GridRow>
          Created with&nbsp;<Icon name="heart" color="red" />
          by&nbsp;<a href="https://hark.ovh" target='_blank'>Harkhenon</a>
        </GridRow>
      </Grid>
    </footer>
  )
}

export default Footer;

