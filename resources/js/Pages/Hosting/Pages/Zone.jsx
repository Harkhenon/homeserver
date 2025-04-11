import React, { useEffect, useState } from 'react'
import {
  Button,
  Form,
  Grid,
  Input,
  Select
} from 'semantic-ui-react';
import { toast } from 'react-toastify'

import typeList from '@js/Resources/json/dnsTypeList.json';
import { useValidator } from '@js/Hooks/useValidator';
import { deepEqual } from '@js/Resources/Util';

const Zone = (props) => {

  const {
    currentDomain,
    setCurrentDomain,
    setInputs,
    inputs,
    domains,
    getDomains
  } = props;

  const domain = {...currentDomain}
  const zone = JSON.parse(domain.zone);
  const [ isLoading, setIsLoading ] = useState(false)

  const handleEdit = (e, select) => {

    const validator = useValidator();

    if(e.target.value !== undefined) {
      setInputs({
        ...inputs,
          [e.target.name]: e.target.value
        })
      }

    if(select !== undefined) {
      setInputs({
        ...inputs,
          [select.name]: select.value
      })
    }

    if (e.target.name === "ip_or_fqdn") {
      if(validator.domain(e.target.value)) {
        setInputs({
          ...inputs,
          "ip_or_fqdn": addDotToDomain(e.target.value)
        })
      }
    }
  }

  const handleSubmit = () => {
    setIsLoading(true)
    client.post('/api/zone', {
      domains_id: currentDomain.id,
      sub: inputs.sub,
      type: inputs.type,
      ip_or_fqdn: inputs.ip_or_fqdn
    })
          .then(r => {
            getDomains(currentDomain.id);
            toast.success(r.data.message);
            setIsLoading(false)
          })
          .catch(error => console.log(error))
  }

  const handleDelete = e => {
    client.delete('/api/zone/' + e.target.dataset.id)
          .then(r => { 
            getDomains(currentDomain.id);
            toast.success("Zone deleted") 
          })
          .catch(e => console.log(e.response));
  }

  const addDotToDomain = (domain) => {

    const dotDomain = () => {
      if(domain[domain.length - 1] !== '.') {
        return domain + '.';
      }
    }

    switch (inputs.type) {
      case 'CNAME':
        return dotDomain(domain);
      case 'MX':
        return dotDomain(domain);
      case 'NS':
        return dotDomain(domain);
    }

  }



  useEffect(() => {
    if (domains === undefined || !deepEqual(JSON.parse(localStorage.getItem('domains')), domains)) {
      getDomains()
    }
  })

  return (
    <Grid inverted as={Form} onChange={handleEdit} onSubmit={handleSubmit}>
      <Form.Group columns={4} as={Grid.Row}>
        <Form.Field as={Grid.Column}>
          <label>Subdomain</label>
          <Input type="text" name="sub">
            <input data-id="zone" onChange={handleEdit}/>
          </Input>
        </Form.Field>
        <Form.Field as={Grid.Column}>
          <label>Type</label>
          <Select
            options={typeList}
            name='type'
            onChange={handleEdit}
            fluid
            placeholder='Select DNS type'
            data-id="zone"
          />
        </Form.Field>
        <Form.Field as={Grid.Column}>
          <label>Ip or FQDN or TXT entry</label>
          <Input type="text" name="ip_or_fqdn">
            <input
              data-id="zone"
              onChange={handleEdit}
            />
          </Input>
        </Form.Field>
        <Form.Field as={Grid.Column} textAlign="center">
          <label>&nbsp;</label>
          <Button type="submit" icon="add" circular color="green" loading={isLoading} />
        </Form.Field>
      </Form.Group>
      {zone.length > 0 &&
        zone.map((e, i) => (
          <Grid.Row key={"zone-" + i} columns={4}>
            <Grid.Column>
              {e.sub}
            </Grid.Column>
            <Grid.Column>
              {e.type}
            </Grid.Column>
            <Grid.Column>
              {e.ip_or_fqdn}
            </Grid.Column>
            <Grid.Column textAlign="center">
              <Button
                data-id={e.id}
                color="red"
                type="button"
                onClick={handleDelete}
                loading={isLoading}
              >
                Delete
              </Button>
            </Grid.Column>
          </Grid.Row>
        ))
      ||
        <p>No zone entries</p>
      }
    </Grid>

  )
}

export default Zone;