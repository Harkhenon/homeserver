import React, { useEffect } from 'react';

import {
  Form,
  Icon,
  Segment,
  Button,
  SegmentGroup,
  Divider
} from 'semantic-ui-react';

import { toast } from 'react-toastify';

import { deepEqual } from '@js/Resources/Util';

const GeneralForm = (props) => {

  const {
    currentDomain,
    setInputs,
    inputs,
    handleEdit,
    getDomains,
    setDomains
  } = props;

  let submitDisabled = false;

  const host = JSON.parse(currentDomain.host);

  const handleSubmit = (e) => {
    let domainPayload = {}
    for(const [key, value] of Object.entries(inputs)) {
      if(typeof(inputs[key]) === "object") {
        if(JSON.stringify(inputs[key]) !== currentDomain[key]) {
          domainPayload[key] = JSON.stringify(value)
        }
      } else if(inputs[key] !== currentDomain[key]) {

        domainPayload[key] = value
      }
    }

    if(inputs.hasOwnProperty('ns1') && !inputs.hasOwnProperty('ns2')) {
      domainPayload['ns2'] = currentDomain['ns2']
    } else if(!inputs.hasOwnProperty('ns1') && inputs.hasOwnProperty('ns2')) {
      domainPayload['ns1'] = currentDomain['ns1']
    }

    if((inputs.hasOwnProperty('ns1') || inputs.hasOwnProperty('ns2')) && !inputs.hasOwnProperty('zone')) {
      domainPayload['zone'] = currentDomain['zone']
    }
    
    if(parseInt(Object.keys(domainPayload).length) === 0) {
      toast.info("No changes on domain " + inputs.fqdn);
    } else {
      domainPayload['updated_at'] = new Date().toISOString().slice(0, 19).replace('T', ' ');
      client.put('/api/domains/' + currentDomain.id, domainPayload)
      .then(r => {
        toast.success(r.data.message);
      })
      .catch(e => {
        toast.error(e.data !== undefined ? e.data.data.message : "Error 500");
      });
    }

    setInputs({})
  }

  const handleReset = () => {
    setInputs(currentDomain)
  }

  return (
    <React.Fragment>
      <SegmentGroup horizontal>
        <Segment secondary inverted textAlign='left'>
          Created on {new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(new Date(currentDomain.created_at))}
        </Segment>
        <Segment secondary inverted textAlign='right'>
          <Icon name="lock" color="green" />
          All websites are automatically SSL secured by Let's Encrypt Certbot
        </Segment>
      </SegmentGroup>
      <Divider
        horizontal 
        inverted 
        section
      >
        <Icon name="globe" color="orange" />&nbsp;
        Domain Section
      </Divider>
      <Form
        inverted
        id='host_general_form'
        onChange={handleEdit}
        onSubmit={handleSubmit}
      >
        <Form.Group widths={2}>
          <Form.Field>
            <label>Domain name</label>
            <Form.Input
              type="text"
              name="fqdn"
              value={inputs.fqdn ? inputs.fqdn : currentDomain.fqdn}
              disabled
              label="https://"
            />
          </Form.Field>
          <Form.Field>

          </Form.Field>
        </Form.Group>
        <Form.Group widths={2}>
          <Form.Field>
            <label>Name Server 1</label>
            <Form.Input type="text" name="ns1" value={inputs.ns1 ? inputs.ns1 : currentDomain.ns1} />
          </Form.Field>
          <Form.Field>
            <label>Name Server 2</label>
            <Form.Input type="text" name="ns2" value={inputs.ns2 ? inputs.ns2 : currentDomain.ns2} />
          </Form.Field>
        </Form.Group>
        <Divider
        horizontal 
        inverted 
        section
      >
        <Icon name="server" color="orange" />&nbsp;
        Webserver Section
      </Divider>
        <Form.Group widths={2}>
          <Form.Field>
            <label>Root directory</label>
            <Form.Input
              type="text"
              name="host:root_dir"
              value={
                (inputs.host !== undefined && inputs.host.root_dir !== undefined)
                ? inputs.host.root_dir 
                : host.root_dir
              }
            >
              <input  />
            </Form.Input>
          </Form.Field>
          <Form.Field>
            <label>NodeJS port (between 4000 & 5000)</label>
            <Form.Input
              type="number"
              min="4000"
              max="5000"
              
              name="host:node_port"
              value={
                (inputs.host !== undefined && inputs.host.node_port !== undefined)
                ? inputs.host.node_port 
                : host.node_port
              }
            >
              <input  />
            </Form.Input>
          </Form.Field>
        </Form.Group>
        <Form.Group widths={2}>
          <Form.Field>
            <label>PHP User (PHP-FPM)</label>
            <Form.Input
              type="text"
              
              name="host:php_user"
              value={
                (inputs.host !== undefined && inputs.host.php_user !== undefined)
                ? inputs.host.php_user 
                : host.php_user
              }
            >
              <input  />
            </Form.Input>
          </Form.Field>
          <Form.Field>
            <label>Disk space (0 for unlimited)</label>
            <Form.Input
              type="number"
              name="host:disk_space"
              value={
                (inputs.host !== undefined && inputs.root_dir !== undefined)
                ? parseInt(inputs.host.disk_space) 
                : host.disk_space
              }
            >
              <input  />
            </Form.Input>
          </Form.Field>
        </Form.Group>
        <Form.Group widths={2}>
          <Form.Field>
            <label>Is FTP Enabled?</label>
            <Form.Checkbox
              toggle
              name="host:ftp_enabled"
              checked={
                (inputs.host !== undefined && inputs.host.ftp_enabled !== undefined)
                ? Boolean(inputs.host.ftp_enabled)
                : Boolean(host.ftp_enabled)
              }
              onChange={handleEdit}
              
            />
          </Form.Field>
          <Form.Field>
            <label>Is SSH Enabled?</label>
            <Form.Checkbox
              toggle
              name="host:ssh_enabled"
              checked={
                (inputs.host !== undefined && inputs.host.ssh_enabled !== undefined)
                ? Boolean(inputs.host.ssh_enabled)
                : Boolean(host.ssh_enabled)
              }
              onChange={handleEdit}
              
            />
          </Form.Field>
        </Form.Group>
        <Divider horizontal hidden section />
        <Form.Group widths={2}>
          <Form.Field>
            <Form.Group>
              <Form.Button
                type="submit"
                color="green"
                disabled={submitDisabled}
                icon
                labelPosition='left'
              >
                <Icon name="check" />
                Save changes
              </Form.Button>
              <Form.Button
                onClick={handleReset}
                labelPosition='left'
                icon
                type="reset"
              >
                <Icon name="undo" />
                Reset changes
              </Form.Button>
            </Form.Group>
          </Form.Field>
        </Form.Group>
        
      </Form>
    </React.Fragment>
  )
}

export default GeneralForm;
