import React from 'react';

import '@sass/Home.scss';
import ServerInformations from '@components/Parts/ServerInformations';

const Home = (props) => {
  return (
    <main>
      <ServerInformations />
    </main>
    );
  }

export default Home;