import React, { useEffect, Suspense } from 'react';
import {
  Card,
  Button,
  Icon,
  Header,
  Segment
} from 'semantic-ui-react';
import { Link } from 'react-router-dom';

import HSBreadcrumb from '../../Parts/HSBreadcrumb';
import DomainsList from './DomainsList';

import '@sass/Hosting.scss';

const Hosting = (props) => {

  const { domains, storeData } = props;

  const handleEdit = (e) => {
    const domainId = e.target.dataset.domainid;
    storeData("currentDomain", domains.find(e => e.id == domainId));
  }

  return (
      <main>
        <HSBreadcrumb />
        <div className="container">
          <Header as={Segment} icon inverted className="host-header">
            <Icon name="server" />
            Hosting management
            <Header.Subheader>
              See all your domains and their details
            </Header.Subheader>
          </Header>
          <Button
            className=''
            icon
            color='green'
            circular
            as={Link}
            to='/domains/add'
          >
            <Icon name='add'/> Create hosting
          </Button>
          <Card.Group itemsPerRow={4} stackable>
            <Suspense fallback={<p>Loading...</p>}>
              <DomainsList
                domains={domains}
                handleEdit={handleEdit}
              />
            </Suspense>  
            
          </Card.Group>
        </div>

      </main>
  )
}

export default Hosting