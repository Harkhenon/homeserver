import React from 'react'
import { toast } from 'react-toastify';
import { Icon, Button, Label, Form, Popup } from 'semantic-ui-react';
import client from '../../../../axiosConfig';

const AddDomainForm = (props) => {

  const {
    storeData,
    domains, 
    addModalOpened,
    controlFormInput,
    domain,
    nsserver1,
    nsserver2,
    loading
  } = props;


  const handleCreate = (e) => {

    toast.configure();

    storeData('addModalOpened', false);
    storeData('loading', true);

    const {
      domain,
      nsserver1,
      nsserver2
    } = props;

    client.post('/api/domains', {
      fqdn: domain,
      ns1: nsserver1,
      ns2: nsserver2
    })
      .then(response => {
        storeData('loading', false);
        storeData('domains', null);
        toast.success('Creation of ' + domain + ' done')
      })
      .catch(error => {
        toast.error("Creation failed, maybe already registered?");
        storeData('loading', false);
      });
  }

  const handleChange = (e) => {
    controlFormInput(e.target.name, e.target.value);
  }

  if(domains !== null && nsserver1 === null && nsserver2 === null) {
    controlFormInput('nsserver1', domains.find(element => element.default === 1).ns1);
    controlFormInput('nsserver2', domains.find(element => element.default === 1).ns2);
  }

  return (
    <Form onSubmit={handleCreate}>
    <Form.Field>
      <Form.Input
        type="text"
        name="domain"
        onChange={handleChange}
        label={
          <Popup trigger={
            <p>Domain name (FQDN) <Icon name="info circle" /></p>
          }>
            <Popup.Header>
              FQDN
            </Popup.Header>
            <Popup.Content>
              Full Qualified Domain Name, otherwise by example: domain.tld (without https://)
            </Popup.Content>
          </Popup>
        }
      />
    </Form.Field>
    <Form.Field>
        <Form.Input
          type='text'
          name='nsserver1'
          onChange={handleChange}
          value={nsserver1 !== null ? nsserver1 : ""}
          label={
            <Popup
              trigger={
                <p>Name server 1 <Icon name='info circle' /></p>
              }
            >
              <Popup.Header>Name servers</Popup.Header>
              <Popup.Content>
                Name servers are needed to rely your domain to your website.
                You can set custom name servers or keep defaults.
              </Popup.Content>
            </Popup>
          } />
    </Form.Field>
    <Form.Field>
          <Form.Input
            type='text'
            name='nsserver2'
            onChange={handleChange}
            label={<p>Name server 2</p>}
            value={nsserver2 !== null ? nsserver2 : ""}
          />
    </Form.Field>
    <Form.Field>
        <Button loading={loading}>Create domain</Button>
    </Form.Field>
  </Form>
  )
}

export default AddDomainForm;
