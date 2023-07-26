import React, { useEffect, useState } from 'react'
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { Container } from 'semantic-ui-react';

import AddHostingForm from '@js/components/Components/Hosting/Pages/Parts/AddHostingForm';

import { useValidator } from '@js/hooks/useValidator';
import client from '@js/axiosConfig';

const NewHost = (props) => {

  const {
    domains,
    getDomains,
    setIsCreating
  } = props;

  const [ inputs, setInputs ] = useState()
  const [ errors, setErrors ] = useState()

  const validate = useValidator();

  const handleCreate = (e) => {

    client.post('/api/domains', {
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
    if(e.target.name === 'fqdn' || e.target.name === 'ns1' || e.target.name === 'ns2') {
      if(validate.domain(e.target.value) === false) {
        setErrors({
          [e.target.name]: "Incorrect format for domain"
        });
      } else {
        setErrors({
          [e.target.name]: undefined
        })
      }
      if(domains.find(el => el.fqdn === e.target.value) !== undefined) {
        setErrors({
          fqdn: "Domain already registered!"
        })
      }
    }

    setInputs({
        ...inputs,
        [e.target.name]: e.target.value,
        root_dir: (() => {
          return e.target.name === 'fqdn' ? '/var/www/' + e.target.value + '/public' : inputs.root_dir;
        })(),
        ssh_enabled: (() => {
          return (data !== undefined && data.name === 'ssh_enabled') ? + data.checked : inputs.ssh_enabled
        })(),
        ftp_enabled: (() => {
          return (data !== undefined && data.name === 'ftp_enabled') ? + data.checked : inputs.ftp_enabled
        })(),
    });
  }



  return (
    <Container>
      <AddHostingForm 
        handleChange={handleChange}
        handleCreate={handleCreate}
        inputs={inputs}
        setInputs={setInputs}
        errors={errors}
        domains={domains}
      />
    </Container>
  )
}

export default NewHost;
