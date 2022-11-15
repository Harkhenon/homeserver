import React, { useEffect } from 'react'
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { Icon, Button, Form, Popup } from 'semantic-ui-react';

import client from '../../../../axiosConfig';
import HSBreadcrumb from '../../../Parts/HSBreadcrumb';
import { useValidator } from '../../../../hooks/useValidator';

const AddDomainForm = (props) => {

  const {
    storeData,
    domains, 
    controlFormInput,
    loading,
    inputs,
    controlFormErrors,
    form_errors
  } = props;

  const navigate = useNavigate();
  const validate = useValidator();
  const { formAdd } = inputs;

  const handleCreate = (e) => {

    storeData('loading', true);

    client.post('/api/domains', inputs.formAdd)
      .then(response => {
        storeData('loading', false);
        storeData('domains', null);
        toast.success('Creation of ' + inputs.formAdd.fqdn + ' done');
        navigate('/domains');
      })
      .catch(error => {
        toast.error("Creation failed, maybe already registered?");
        storeData('loading', false);
      });
  }

  const handleChange = (e) => {
    if(e.target.name === 'fqdn') {
      if(validate.domain(e.target.value) === false) {
        controlFormErrors({
          add_fqdn: "Incorrect format for domain"
        });
      } else {
        controlFormErrors({
          add_fqdn: undefined
        })
      }
    }
    controlFormInput('formAdd', {
        ...formAdd,
        [e.target.name]: e.target.value
    });
  }

  useEffect(() => {
    if (domains === null || undefined) {
        navigate('/domains');
        return null;
    }
    if(inputs.formAdd !== undefined && inputs.formAdd.ns2 === undefined) {

      controlFormInput('formAdd', {
          ...formAdd,
          ns1: domains.find(element => element.default === 1).ns1,
          ns2: domains.find(element => element.default === 1).ns2
      });
    }
  });



  return (
    <main>
      <HSBreadcrumb />
      <p>CACA</p>
      <Form onSubmit={handleCreate}>
      <Form.Field>
        <Form.Input
          type="text"
          name="fqdn"
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
          error={form_errors ? form_errors.add_fqdn : false}
          
        />
      </Form.Field>
      <Form.Field>
          <Form.Input
            type='text'
            name='ns1'
            onChange={handleChange}
            value={formAdd ? formAdd.ns1 ? formAdd.ns1 : "" : ""}
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
              name='ns2'
              onChange={handleChange}
              label={<p>Name server 2</p>}
              value={formAdd ? formAdd.ns1 ? formAdd.ns1 : "" : ""}
            />
      </Form.Field>
      <Form.Field>
          <Button loading={loading}>Create domain</Button>
      </Form.Field>
    </Form>
  </main>
  )
}

export default AddDomainForm;
