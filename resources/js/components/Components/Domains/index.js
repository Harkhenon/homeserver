import React, { useEffect } from 'react';
import { toast } from 'react-toastify';
import { Card, Icon, List, Button, Label, Modal, Form, Popup } from 'semantic-ui-react';
import client from '../../../axiosConfig';

import '../scss/Domains.scss';
import AddDomainForm from './Forms/AddDomainForm';
import EditDomainForm from './Forms/EditDomainForm';

const Domains = (props) => {

  const { 
    storeData,
    domains, 
    addModalOpened,
    controlFormInput,
    domain,
    nsserver1,
    nsserver2,
    editModalOpened,
    editDomain,
    loading
  } = props;

  toast.configure();

  useEffect(() => {
    client.get('/api/domains')
      .then(response => {
        if(domains === null) {
          storeData("domains", response.data.data);
        } else {
          if(domains.length !== response.data.data.length) {
            storeData("domains", response.data.data);
          }
        }
      })
      .catch(error => {
        console.log(error);
      });
  });

  const handleDelete = (e) => {
    const domainId = e.target.dataset.id;

    client.delete('/api/domains/' + domainId,{
      id: domainId
    })
      .then(response => {
        console.log(response);
        storeData('domains', null);
        toast.success('Domain ' + domainId + ' deleted');
      })
      .catch(error => {
        console.log(error);
        toast.error('An error was encountered')
      })
  }

  const handleEdit = (e) => {
    const selectedDomain = e.target.dataset.id;
    const actualDomain = domains.find(element => element.fqdn === selectedDomain);
    storeData('editDomain', actualDomain.fqdn);
    controlFormInput('domain', actualDomain.fqdn);
    controlFormInput('nsserver1', actualDomain.ns1);
    controlFormInput('nsserver2', actualDomain.ns2);
    storeData('editModalOpened', true);
  }


  const domainsCards = (data) => {
    return data.map(element => (
        <Card key={element.fqdn}>
          <Card.Content>
            <Card.Header>
              <Icon name="world" />{element.fqdn}
            </Card.Header>
            </Card.Content>
            <Card.Content extra>
              <Label as={Card.Description}>
                <Icon name="server"/>DNS servers
              </Label>
              <List>
                <List.Item>
                  <Icon name="arrow right"/>{element.ns1}
                </List.Item>
                <List.Item>
                  <Icon name="arrow right"/>{element.ns2}
                </List.Item>
              </List>
            </Card.Content>
            <Card.Content extra>
              
                {element.default !== 1 && (
                  <div className="ui two buttons">
                    <Button
                      color="orange"
                      labelPosition='left'
                      icon
                      onClick={handleEdit}
                      data-id={element.fqdn}
                    >
                      <Icon name='edit'/>
                      Edit
                    </Button>
                    <Button
                      color="red"
                      labelPosition='right'
                      icon
                      onClick={handleDelete}
                      data-id={element.fqdn}
                    >
                      Delete
                      <Icon name='delete'/>
                    </Button>
                  </div>
                ) || (
                    <React.Fragment>
                      <p>Default domain</p>
                      <p>Can't edit or delete it</p>
                    </React.Fragment>
                )}
            </Card.Content>
        </Card>
    ));
  }

  return (
    <React.Fragment>
      <main>
        <div className="container">
          <h3>Domains management</h3>
          <Card.Group itemsPerRow={4} stackable>
            {domains !== null && domainsCards(domains)}
          </Card.Group>
        </div>
        <Button
          className='floated-add-button'
          icon
          color='green'
          circular
          onClick={() => storeData('addModalOpened', true)}
        >
          <Icon name='add'/> Add domain
        </Button>
        <Modal
          open={addModalOpened}
          onClose={() => {
            storeData('addModalOpened', false);
            controlFormInput('nsserver1', null);
            controlFormInput('nsserver2', null);
          }}
          onOpen={() => storeData('addModalOpened', true)}
        >
          <Modal.Header>
            Create new domain
          </Modal.Header>
          <Modal.Content>
            <AddDomainForm
              storeData={storeData}
              domains={domains}
              addModalOpened={addModalOpened}
              controlFormInput={controlFormInput}
              domain={domain}
              nsserver1={nsserver1}
              nsserver2={nsserver2}
              loading={loading}
            />
          </Modal.Content>
          <Modal.Content>
          <Modal.Description>
            Creating new domain on the server permit to host a website on it.
            You can use your domain for multiple purposes like hosting, redirects,
            linking an IP and more.
          </Modal.Description>
          </Modal.Content>
        </Modal>
        <Modal
          open={editModalOpened}
          onClose={() => {
            storeData('editModalOpened', false);
            controlFormInput('domain', null);
            controlFormInput('nsserver1', null);
            controlFormInput('nsserver2', null);
          }}
          onOpen={() => storeData('editModalOpened', true)}
        >
          <Modal.Header>
            Edit domain
          </Modal.Header>
          <Modal.Content>
            <EditDomainForm
              storeData={storeData}
              domains={domains}
              addModalOpened={addModalOpened}
              controlFormInput={controlFormInput}
              editDomain={editDomain}
              domain={domain}
              nsserver1={nsserver1}
              nsserver2={nsserver2}
              loading={loading}
            />
          </Modal.Content>
          <Modal.Content>
          <Modal.Description>
            Edit selected domain
          </Modal.Description>
          </Modal.Content>
        </Modal>
        </main>
      </React.Fragment>
  );
};

export default Domains;