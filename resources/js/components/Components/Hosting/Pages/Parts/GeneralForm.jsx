import React from 'react';

import {
  Form,
  Grid,
  GridColumn,
  GridRow,
  Icon,
  Segment,
  Button,
  Input
} from 'semantic-ui-react';

import { Link } from 'react-router-dom';

const GeneralForm = (props) => {

  const { currentDomain } = props;
  const { host } = currentDomain;
  const { plan } = host;

  return (
    <React.Fragment>
      <Segment tertiary>
        Actual plan : {plan.name}
        <Button as={Link} to="/hosting/plans" size='tiny' color="teal">
          Manage plans
        </Button>
      </Segment>
      <Segment secondary>
        <Icon name="lock" color="green" />
        All websites are automatically SSL secured by Let's Encrypt
      </Segment>
      <Form inverted as={Grid} id='host_general_form'>
        <Form.Group as={GridRow} columns={2}>
          <Form.Field as={GridColumn}>
            <label>Domain name</label>
            <Input
              type="text"
              name="fqdn"
              value={currentDomain.fqdn}
              disabled
              label="https://"
            />
          </Form.Field>
          <Form.Field as={GridColumn}>
            <label>Created at</label>
            <Input
              type="text"
              disabled
              value={new Date(currentDomain.created_at).toDateString()}
              label={{ icon: 'calendar' }}
            />
          </Form.Field>
          <Form.Field as={GridColumn}>
            <label>Name Server 1</label>
            <Input type="text" name="ns1" value={currentDomain.ns1} />
          </Form.Field>
          <Form.Field as={GridColumn}>
            <label>Name Server 2</label>
            <Input type="text" name="ns2" value={currentDomain.ns2} />
          </Form.Field>
        </Form.Group>
        <Form.Group as={GridRow} columns={2}>
          <Form.Field as={GridColumn}>
            <label>Root directory</label>
            <Input type="text" name="root_dir" value={host.root_dir} label={{ icon: 'folder open'}} />
          </Form.Field>
          <Form.Field as={GridColumn}>
            <label>NodeJS port (between 4000 & 5000)</label>
            <Input type="text" name="node_port" value={host.node_port} label={{ icon: 'node'}} />
          </Form.Field>
          <Form.Field as={GridColumn}>
            <label>PHP User (PHP-FPM)</label>
            <Input type="text" name="php_user" value={host.php_user} label={{ icon: 'php' }} />
          </Form.Field>
          <Form.Field as={GridColumn}>
            <label>Disk space (0 for unlimited)</label>
            <Input type="text" name="disk_space" value={host.disk_space} label={{ icon: 'hdd' }} />
          </Form.Field>
          <Form.Field as={GridColumn} width={6}>
            <label>Is FTP Enabled?</label>
            <Form.Checkbox name="ftp_enabled" checked={host.ftp_enabled ? true : false} />
          </Form.Field>
          <Form.Field as={GridColumn} width={6}>
            <label>Is SSH Enabled?</label>
            <Form.Checkbox name="ssh_enabled" checked={host.ssh_enabled ? true : false} />
          </Form.Field>
        </Form.Group>
      </Form>
    </React.Fragment>
  )
}

export default GeneralForm;
