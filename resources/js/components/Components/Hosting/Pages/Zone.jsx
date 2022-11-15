import React from 'react'
import {
  Button,
  Form,
  Grid,
  GridColumn,
  GridRow,
  Input,
  Select
} from 'semantic-ui-react';

import typeList from '@js/resources/json/dnsTypeList.json';

const Zone = (props) => {

  const { currentDomain, handleEdit, handleSubmit } = props;
  const { zones } = currentDomain;

  return (
    <Grid inverted as={Form} onChange={handleEdit} onSubmit={handleSubmit}>
      <Form.Group columns={4} as={GridRow}>
        <Form.Field as={GridColumn}>
          <label>Subdomain</label>
          <Input type="text" name="sub">
            <input data-id="zone" />
          </Input>
        </Form.Field>
        <Form.Field as={GridColumn}>
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
        <Form.Field as={GridColumn}>
          <label>Ip or FQDN or TXT entry</label>
          <Input type="text" name="ip_or_fqdn">
            <input data-id="zone" />
          </Input>
        </Form.Field>
        <Form.Field as={GridColumn}>
          <label>&nbsp;</label>
          <Button type="submit" icon="add" circular color="green" />
        </Form.Field>
      </Form.Group>
      {zones.length > 0 &&
        <p>Hey! there are zone entries!</p>
      ||
        <p>No zone entries</p>
      }
    </Grid>

  )
}

export default Zone;