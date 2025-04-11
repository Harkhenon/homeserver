import React, { useEffect } from 'react';

import {
  Form,
  Grid,
  GridColumn,
  GridRow,
  Icon,
  Segment,
  Button,
  Input,
  Loader
} from 'semantic-ui-react';

import { Link } from 'react-router-dom';

const GeneralForm = (props) => {

  const {
    currentDomain,
    controlFormInput,
    inputs,
    handleEdit,
    handleSubmit
  } = props;

  const { host } = currentDomain;
  const { plan } = host;

  useEffect(() => {
    if(inputs === null || !inputs.hasOwnProperty('generalForm')) {
      controlFormInput('generalForm', currentDomain);
    }
  });

  if(inputs !== null) {
    if(inputs.hasOwnProperty('generalForm')) {
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
          <Grid
            inverted
            as={Form}
            id='host_general_form'
            onChange={handleEdit}
            onSubmit={handleSubmit}
          >
            <Form.Group>
              <Form.Button type="submit" color="green">
                Save changes
              </Form.Button>
            </Form.Group>
            <Form.Group as={GridRow} columns={2}>
              <Form.Field as={GridColumn}>
                <label>Domain name</label>
                <Input
                  type="text"
                  name="fqdn"
                  value={inputs.generalForm.fqdn}
                  //disabled
                  label="https://"
                />
              </Form.Field>
              <Form.Field as={GridColumn}>
                <label>Created at</label>
                <Input
                  type="text"
                  disabled
                  value={new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full' }).format(new Date(currentDomain.created_at))}
                  label={{ icon: 'calendar' }}
                />
              </Form.Field>
              <Form.Field as={GridColumn}>
                <label>Name Server 1</label>
                <Input type="text" name="ns1" value={inputs.generalForm.ns1} />
              </Form.Field>
              <Form.Field as={GridColumn}>
                <label>Name Server 2</label>
                <Input type="text" name="ns2" value={inputs.generalForm.ns2} />
              </Form.Field>
            </Form.Group>
            <Form.Group as={GridRow} columns={2}>
              <Form.Field as={GridColumn}>
                <label>Root directory</label>
                <Input
                  type="text"
                  name="root_dir"
                  value={inputs.generalForm.host.root_dir}
                >
                  <input data-id="host" />
                </Input>
              </Form.Field>
              <Form.Field as={GridColumn}>
                <label>NodeJS port (between 4000 & 5000)</label>
                <Input
                  type="text"
                  data-id="host"
                  name="node_port"
                  value={inputs.generalForm.host.node_port}
                >
                  <input data-id="host" />
                </Input>
              </Form.Field>
              <Form.Field as={GridColumn}>
                <label>PHP User (PHP-FPM)</label>
                <Input
                  type="text"
                  data-id="host"
                  name="php_user"
                  value={inputs.generalForm.host.php_user}
                >
                  <input data-id="host" />
                </Input>
              </Form.Field>
              <Form.Field as={GridColumn}>
                <label>Disk space (0 for unlimited)</label>
                <Input
                  type="text"
                  name="disk_space"
                  value={inputs.generalForm.host.disk_space}
                >
                  <input data-id="host" />
                </Input>
              </Form.Field>
              <Form.Field as={GridColumn} width={6}>
                <label>Is FTP Enabled?</label>
                <Form.Checkbox
                  toggle
                  name="ftp_enabled"
                  checked={Boolean(inputs.generalForm.host.ftp_enabled)}
                  onChange={handleEdit}
                  data-id="host"
                />
              </Form.Field>
              <Form.Field as={GridColumn} width={6}>
                <label>Is SSH Enabled?</label>
                <Form.Checkbox
                  toggle
                  name="ssh_enabled"
                  checked={Boolean(inputs.generalForm.host.ssh_enabled)}
                  onChange={handleEdit}
                  data-id="host"
                />
              </Form.Field>
            </Form.Group>
          </Grid>
        </React.Fragment>
      )
    }
  } else {
    return (
      <Loader active />
    )
  }
}

export default GeneralForm;
