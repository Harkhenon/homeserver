import React, { useLayoutEffect } from 'react';
import { toast } from 'react-toastify';
import { Link, useNavigate } from 'react-router-dom';
import {
  Icon,
  Button,
  Form,
  Popup,
  Menu,
  Segment,
  Input,
  Select,
  Table,
} from 'semantic-ui-react';

import HSBreadcrumb from '../../../../Layouts/HSBreadcrumb';
import client from '../../../../axiosConfig';
import './scss/EditDomainForm.scss';
import { useValidator } from '../../../../hooks/useValidator';
import EditDomainZoneTable from './EditDomainZoneTable';

const EditDomainForm = (props) => {

    const {
        storeData,
        domains,
        controlFormInput,
        inputs,
        zone,
        loading,
        activeTabItem,
        zoneForm,
        getDomains,
        actualDomain
      } = props;

      // If no domain is loaded, redirect directly to domains list

      const navigate = useNavigate();
      const validate = useValidator();

      if(
        inputs === null ||
        domains === null
      ) {
        navigate('/domains');
        return null;
      }

      const activeDomain = domains.find(e => e.fqdn === inputs.domain);

      const handleEdit = (e) => {

        storeData('loading', true);

        client.put('/api/domains/' + actualDomain.domain, {

          fqdn: inputs.domain,
          ns1: inputs.nsserver1 ? inputs.nsserver1 : actualDomain.ns1,
          ns2: inputs.nsserver2 ? inputs.nsserver2 : actualDomain.ns2,
          zone: zone
        })
          .then(response => {
            storeData('loading', false);
            storeData('domains', null);
            toast.success('Edit of ' + response.data.data +  ' done');
          })
          .catch(error => {
            storeData('loading', false);
            toast.error('An error was encountered');
            console.log(error)
          });
      }

      const handleChange = (e, { value }) => controlFormInput(e.target.name ?? 'zoneEdit.type', e.target.value ?? value);

      const handleTabItem = (e, { name }) => storeData('activeTabItem', name);

      const handleEditZone = (e, {name, value}) => {
        controlFormInput('zoneForm', {
          ...inputs.zoneForm,
          [e.target.name ?? [name]]: e.target.value ?? value
        });
      }

      const handleSubmitZone = (e) => {

        if(!inputs.zoneForm.sub, !inputs.zoneForm.type || !inputs.zoneForm.ip_or_fqdn) {

          toast.error('Sub, type and Ip or FQDN inputs cannot be empty');
          return null;
        }

        if(
          !validate.ipv4(inputs.zoneForm.ip_or_fqdn)
          && !validate.domain(inputs.zoneForm.ip_or_fqdn)
          ) {
            toast.error('Wrong IP or FQDN');
            return null;
        }

        client.post('/api/zone', {
          domains_id: domains.find(e => e.fqdn === inputs.domain).id,
          sub: inputs.zoneForm.sub,
          type: inputs.zoneForm.type,
          ip_or_fqdn: inputs.zoneForm.ip_or_fqdn
        })
          .then(r => getDomains())
          .catch(e => console.log(e));
      }

      return (
        <main>
        <HSBreadcrumb/>
        <h2>Edit domain: {actualDomain.domain}</h2>
        <Menu attached='top' tabular inverted>
          <Menu.Item
            name='configuration'
            active={activeTabItem === 'configuration' || activeTabItem === null}
            onClick={handleTabItem}
            icon='setting'
          />
          <Menu.Item
            name='zone'
            active={activeTabItem === 'zone'}
            onClick={handleTabItem}
            icon='server'
          />
        </Menu>
        {(activeTabItem === 'configuration' || activeTabItem === null) && (
          <Form onSubmit={handleEdit} attached='bottom' inverted>
          <Form.Field>
            <Form.Input
              type="text"
              name="domain"
              value={inputs.domain}
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
                value={inputs.nsserver1 ? inputs.nsserver1 : actualDomain.ns1}
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
                  value={inputs.nsserver2 ? inputs.nsserver2 : actualDomain.ns2}
                />
          </Form.Field>
          <Form.Field>
              <Button loading={loading} type="submit">Edit domain</Button>
          </Form.Field>
        </Form>
        )}
        {(activeTabItem === 'zone') && (
          <React.Fragment>
            <EditDomainZoneTable
              activeDomain={activeDomain}
              handleEditZone={handleEditZone}
              handleSubmitZone={handleSubmitZone}
              getDomains={getDomains}
            />
          </React.Fragment>
        )}
      </main>
      )
}

export default EditDomainForm;
