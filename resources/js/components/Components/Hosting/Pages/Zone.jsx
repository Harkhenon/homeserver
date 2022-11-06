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

import typeList from '../../../../resources/json/dnsTypeList.json';

const Zone = (props) => {

  const { currentDomain } = props;
  const { zones } = currentDomain;

  return (
    <Form inverted as={Grid}>
      <Form.Group columns={4} as={GridRow}>
        <Form.Field as={GridColumn}>
          <label>Subdomain</label>
          <Input type="text" name="sub" />
        </Form.Field>
        <Form.Field as={GridColumn}>
          <label>Type</label>
          <Select
            options={typeList}
            name='type'
            onChange={null}
            fluid
            placeholder='Select DNS type'
          />
        </Form.Field>
        <Form.Field as={GridColumn}>
          <label>Ip or FQDN or TXT entry</label>
          <Input type="text" name="ip_or_fqdn" />
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
    </Form>

  )
}

export default Zone;