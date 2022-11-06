import React, { useEffect } from 'react';
import {
  Header,
  Loader,
  Icon,
  Segment,
  Tab
} from 'semantic-ui-react';
import { Navigate } from 'react-router';

import HSBreadcrumb from '../../../Parts/HSBreadcrumb';
import GeneralForm from './Parts/GeneralForm';
import Zone from './Zone';

import '../../../../../sass/Hosting.scss';

const General = (props) => {

  const { domainId, domains } = props;
  let currentDomain = null;

  if(domains, domainId === null || undefined) {
    return <Navigate to="/hosting" />
  }

  if (domains !== null) {
    currentDomain = domains.find(element => element.id == domainId);
  }

  const panes = [
    {
      menuItem: 'General informations',
      render: () => <Tab.Pane attached={false} inverted>
        <GeneralForm currentDomain={currentDomain} />
      </Tab.Pane>,
    },
    {
      menuItem: 'Domain zone',
      render: () => <Tab.Pane attached={false} inverted>
        <Zone currentDomain={currentDomain} />
      </Tab.Pane>
    }
  ];

  return (
    <main>
        <HSBreadcrumb />
        <Header as={Segment} icon inverted className='host-header'>
          <Icon name="edit" />
          Website edition
        </Header>
        {currentDomain !== null &&
          <Tab
            menu={{ secondary: true, inverted: true }}
            panes={panes}
          />
        ||
        <Loader active />
      }
    </main>
    )
}

export default General;
