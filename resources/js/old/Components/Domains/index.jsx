import React, { useEffect, Suspense } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { Card, Icon, List, Button, Label, Loader } from 'semantic-ui-react';
import client from '../../../axiosConfig';
import HSBreadcrumb from '../../../Layouts/HSBreadcrumb';
import DomainsList from './DomainsList';

import '../scss/Domains.scss';

const Domains = (props) => {

  const {
    storeData,
    domains,
    controlFormInput,
    getDomains,
  } = props;

  const navigate = useNavigate();

  useEffect(() => {
    if(!domains) getDomains();
  }, [domains]);

  const handleDelete = (e) => {
    const domainId = e.target.dataset.id;

    client.delete('/api/domains/' + domainId,{
      id: domainId
    })
      .then(response => {
        storeData('domains', null);
        toast.success('Domain ' + domainId + ' deleted');
      })
      .catch(error => {
        toast.error('An error was encountered')
      })
  }

  const handleEdit = (e) => {
    const selectedDomain = e.target.dataset.id;
    const actualDomain = domains.find(element => element.fqdn === selectedDomain);
    controlFormInput('domain', actualDomain.fqdn);
    storeData('actualDomain', {
      domain: actualDomain.fqdn,
      ns1: actualDomain.ns1,
      ns2: actualDomain.ns2
    });
    navigate('/domains/edit');
  }

  return (
    <React.Fragment>
      <main>
        <HSBreadcrumb />
        <div className="container">
          <h1>Domains management</h1>
          <Card.Group itemsPerRow={4} stackable>
            <Suspense fallback={<p>Loading...</p>}>
              <DomainsList
                domains={domains}
                handleEdit={handleEdit}
                handleDelete={handleDelete}
              />
            </Suspense>

          </Card.Group>
        </div>
        <Button
          className='floated-add-button'
          icon
          color='green'
          circular
          as={Link}
          to='/domains/add'
        >
          <Icon name='add'/> Add domain
        </Button>
      </main>
    </React.Fragment>
  );
};

export default Domains;
