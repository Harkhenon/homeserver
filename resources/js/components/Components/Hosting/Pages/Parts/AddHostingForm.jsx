import React, { useEffect } from 'react'
import {
  Input,
  Icon,
  FormGroup,
  Button,
  Divider,
  FormField,
  Form
} from 'semantic-ui-react';

const AddHostingForm = (props) => {

  const { 
    handleChange, 
    handleCreate, 
    inputs,
    setInputs,
    errors,
    domains
  } = props;

  useEffect(() => {
    if(!inputs) {
      setInputs({
        fqdn: "",
        ns1: domains.find(element => element.default === 1).ns1,
        ns2: domains.find(element => element.default === 1).ns2,
        root_dir: "/var/www/",
        disk_space: 0,
        php_user: 'homeserver',
        node_port: 4000,
        ftp_enabled: 0,
        ssh_enabled: 0
      });
    }
  })


  return (
    <Form onChange={handleChange} onSubmit={handleCreate}>
      <Divider horizontal>
        <Icon name="globe" color="orange" /> Domain Section
      </Divider>
      <FormGroup widths={2}>
        <FormField>
          <label>Full Qualified Domain Name</label>
          <Form.Input
            type="text"
            name="fqdn" 
            error={errors ? errors.fqdn : false}
            value={inputs ? inputs.fqdn : ""}
          />
        </FormField>
        <FormField>
          <label>Name Server 1</label>
          <Form.Input 
            type="text" 
            name="ns1"
            error={errors ? errors.ns1 : false}
            value={inputs ? inputs.ns1 : ""}
          />
        </FormField>
        <FormField>
          <label>Name Server 2</label>
          <Form.Input 
            type="text" 
            name="ns2"
            error={errors ? errors.ns2 : false}
            value={inputs ? inputs.ns2 : ""}
          />
        </FormField>
      </FormGroup>
      <Divider horizontal >
        <Icon name="server" color="orange" /> Webserver Section
      </Divider>
      <FormGroup widths={2}>
        <FormField>
          <label>Root Directory</label>
          <Input 
            type="text" 
            name="root_dir"
            disabled
            value={inputs ? inputs.root_dir : ""}
          />
        </FormField>
        <FormField>
          <label>NodeJS Port</label>
          <Input
            type="number" 
            min={4000} 
            max={5000} 
            name="node_port"
            value={inputs ? inputs.node_port : ""}
          />
        </FormField>
      </FormGroup>
      <FormGroup widths={2}>
        <FormField>
          <label>PHP User (PHP-FPM)</label>
          <Input
            type="text" 
            name="php_user"
            value={inputs ? inputs.php_user : ""}
          />
        </FormField>
        <FormField>
          <label>Disk space (0 for unlimited)</label>
          <Input
            type="number"
            name="disk_space"
            value={inputs ? inputs.disk_space : ""}
          />
        </FormField>
      </FormGroup>
      <FormGroup widths={2}>
      <FormField>
        <label>FTP access</label>
        <Form.Checkbox
          toggle
          name='ftp_enabled'
          onChange={handleChange}
        />
      </FormField>
      <FormField>
        <label>SSH enabled</label>
        <Form.Checkbox
          toggle
          name='ssh_enabled'
          onChange={handleChange}
        />
      </FormField>
    </FormGroup>
      <FormGroup widths={2}>
        <FormField>
          <Button 
            type="submit" 
           color="green"
           labelPosition='left'
           icon
          >
            <Icon name="check" />
            Save changes
          </Button>
        </FormField>
      </FormGroup>
      </Form>
  )
}

export default AddHostingForm;
