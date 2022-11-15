import React from 'react';
import { toast } from 'react-toastify';
import {
    Segment,
    Form,
    Select,
    Input,
    Table,
    Button
} from 'semantic-ui-react';
import client from '../../../../axiosConfig';

import typeList from '../../../../resources/json/dnsTypeList';

const EditDomainZoneTable = ({
  handleSubmitZone,
  handleEditZone,
  activeDomain,
  getDomains
}) => {

  const handleDeleteZoneItem = (e) => {

    const id = e.target.value;

    console.log(e.target);

    client.delete('api/zone/' + id)
      .then((res) => {
        toast.success('Entry deleted');
        getDomains();
      })
      .catch(err => toast.error('An error occured'))
  }

  return (
  <Segment attached='bottom' inverted>
      <h3>
        Be careful when edit dns zone, it may crash your server if you enter wrong data<br />
      </h3>
      <Form inverted id='ns-element-form' onSubmit={handleSubmitZone}>
        <Form.Group widths='equal'>
          <Form.Field>
            <Input
              type='text'
              name='sub'
              placeholder='Sub-domain'
              onChange={handleEditZone}
            />
          </Form.Field>
          <Form.Field>
            <Select
              options={typeList}
              name='type'
              onChange={handleEditZone}
              fluid
              placeholder='Select DNS type'
            />
          </Form.Field>
          <Form.Field>
            <Input
              name='ip_or_fqdn'
              placeholder='IP address or FQDN'
              onChange={handleEditZone}
            />
          </Form.Field>
        </Form.Group>
          <Button type='submit'>Save DNS entry</Button>
      </Form>
      <Table celled basic inverted>
        <Table.Header>
          <Table.Row>
            <Table.HeaderCell>
              Sub-domain
            </Table.HeaderCell>
            <Table.HeaderCell>
              Type
            </Table.HeaderCell>
            <Table.HeaderCell>
              IP or FQDN
            </Table.HeaderCell>
            <Table.HeaderCell>
              
            </Table.HeaderCell>
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {activeDomain.zone.map(e => (
            <Table.Row key={e.id}>
              <Table.Cell>
                {e.sub}
              </Table.Cell>
              <Table.Cell>
                {e.type}
              </Table.Cell>
              <Table.Cell>
                {e.ip_or_fqdn}
              </Table.Cell>
              <Table.Cell>
                <Button 
                  color='red'
                  value={e.id}
                  onClick={handleDeleteZoneItem}
                >
                  Delete
                </Button>
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
  </Segment>
  )
};

export default EditDomainZoneTable;