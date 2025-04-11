import React, { useEffect, useState } from 'react'
import { toast } from 'react-toastify';

import {
  Input,
  Icon,
  FormGroup,
  Button,
  Divider,
  FormField,
  Form
} from 'semantic-ui-react';

import AddHostingForm from '@pages/Hosting/Pages/Parts/AddHostingForm';

import { useValidator } from '@js/Hooks/useValidator';

export default function NewHost({ domains, setDomains, isCreating, form }) {

  const [ inputs, setInputs ] = useState()
  const [ errors, setErrors ] = useState()

  const validate = useValidator();

  const handleCreate = (e) => {

    form.post(route('hosting.create'), {
      fqdn: inputs.fqdn,
      ns1: inputs.ns1,
      ns2: inputs.ns2,
      host: JSON.stringify({
        node_port: inputs.node_port,
        php_user: inputs.php_user,
        disk_space: inputs.disk_space,
        root_dir: inputs.root_dir,
        ftp_enabled: inputs.ftp_enabled,
        ssh_enabled: inputs.ssh_enabled
      }),
      zone: JSON.stringify({})
    })
    .then(response => {
      toast.success(inputs.fqdn + ' created successfully');
      setInputs(undefined)
      getDomains();
      setIsCreating(false)
    })
    .catch(error => {
      toast.error("Creation failed, maybe already registered?");
    });
  }

  const handleChange = (e, data) => {
    // if(e.target.name === 'fqdn' || e.target.name === 'ns1' || e.target.name === 'ns2') {
    //   if(validate.domain(e.target.value) === false) {
    //     setErrors({
    //       [e.target.name]: "Incorrect format for domain"
    //     });
    //   } else {
    //     setErrors({
    //       [e.target.name]: undefined
    //     })
    //   }
    //   if(domains.find(el => el.fqdn === e.target.value) !== undefined) {
    //     setErrors({
    //       fqdn: "Domain already registered!"
    //     })
    //   }
    // }

    // setInputs({
    //     ...inputs,
    //     [e.target.name]: e.target.value,
    //     root_dir: (() => {
    //       return e.target.name === 'fqdn' ? '/var/www/' + e.target.value + '/public' : inputs.root_dir;
    //     })(),
    //     ssh_enabled: (() => {
    //       return (data !== undefined && data.name === 'ssh_enabled') ? + data.checked : inputs.ssh_enabled
    //     })(),
    //     ftp_enabled: (() => {
    //       return (data !== undefined && data.name === 'ftp_enabled') ? + data.checked : inputs.ftp_enabled
    //     })(),
    // });
    form.transform(data => ({
      host: {
        php_user: data.php_user
      }
    }))
    console.log(form.data)
   
  }

  return (
    <section className='p-5'>
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
              value={form.data.fqdn}
              onChange={(e,{name, value}) => form.setData(name, value)}
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
              name="host.root_dir"
              disabled
              value={form.data.host.root_dir}
              onChange={(e, { name, value }) => form.setData(name, value)}
            />
          </FormField>
          <FormField>
            <label>NodeJS Port</label>
            <Input
              type="number" 
              min={4000} 
              max={5000} 
              name="host.node_port"
              value={form.data.host.node_port}
              onChange={(e, { name, value }) => form.setData(name, value)}
            />
          </FormField>
        </FormGroup>
        <FormGroup widths={2}>
          <FormField>
            <label>PHP User (PHP-FPM)</label>
            <Input
              type="text" 
              name="php_user"
              value={form.data.php_user}
              onChange={(e, { name, value}) => form.setData(name, value)}
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
    </section>
  )
};
